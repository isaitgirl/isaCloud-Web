/**
 * @description
 *  isaCloud: records the structured events that explain a dropped session.
 *
 *  `record()` only ever stores primitives: no message bodies, no stanza XML,
 *  no contact JIDs, no credentials. Every entry carries a small snapshot of the
 *  connection and page state (`ctx`), so the event itself can stay tiny.
 *
 *  The entries live in the dedicated `isacloud-diagnostics` IndexedDB (see
 *  `store.js`) and in a rolling in-memory buffer within the retention window.
 *  The buffer is what builds the report, so no asynchronous read is needed for
 *  the download.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, constants, log } from '@converse/headless';
import * as store from './store.js';

const HOUR_MS = 60 * 60 * 1000;
const HEARTBEAT_MS = 10 * 1000;
const VISIBLE_GAP_MS = 30 * 1000;
const HIDDEN_GAP_MS = 90 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
const MAX_STRING = 500;
const SESSION_COOKIE = 'isacloud_session';
/** A rough JID/e-mail shape, redacted from free-form strings (error messages, reasons). */
const JID_PATTERN = /[^\s@<>"']+@[^\s@<>"']+/g;

/**
 * Keys that may carry message content, stanza XML or credentials. They are
 * dropped before an event is stored, whatever the emitter intended.
 */
const SENSITIVE_KEYS = new Set([
    'body',
    'subject',
    'stanza',
    'xml',
    'password',
    'pass',
    'token',
    'access_token',
    'refresh_token',
    'secret',
    'key',
    'keys',
    'omemo_key',
    'device_key',
    'auth',
    'authorization',
    'from',
    'to',
    'jid',
    'contact',
    'peer',
    'sender',
    'recipient',
    'room',
    'nickname',
    'alias',
]);

/** In-memory rolling buffer, oldest first. @type {Record<string, any>[]} */
let entries = [];

/** @type {ReturnType<typeof setInterval>|null} */
let heartbeat_timer = null;

/** @type {Array<() => void>} */
let cleanups = [];

let started_promise = null;
let started = false;
let generation = 0;
let last_tick = 0;
let last_prune_at = 0;
let hidden_since = 0;
let frozen_since = 0;

let resolve_ready;
/** Resolves once the store is hydrated and `app_start` has been recorded. */
export const ready = new Promise((resolve) => {
    resolve_ready = resolve;
});

/**
 * Reads a setting defensively: the recorder can be imported directly by specs,
 * where the headless bundle's settings may not have been initialized.
 * @param {string} name
 * @returns {any}
 */
function getSetting(name) {
    return api.settings?.get?.(name);
}

/**
 * @returns {boolean}
 */
function isEnabled() {
    return getSetting('isacloud_diagnostics') !== false;
}

/**
 * @returns {number}
 */
function retentionHours() {
    const hours = Number(getSetting('isacloud_diagnostics_hours'));
    return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

/**
 * @returns {number}
 */
function maxEntries() {
    const max = Number(getSetting('isacloud_diagnostics_max_entries'));
    return Number.isFinite(max) && max > 0 ? max : 5000;
}

/**
 * @returns {number}
 */
function retentionCutoff() {
    return Date.now() - retentionHours() * HOUR_MS;
}

/**
 * @param {string} value
 * @param {number} [limit]
 * @returns {string}
 */
function truncate(value, limit = MAX_STRING) {
    return value.length > limit ? value.slice(0, limit) : value;
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Keeps strings, finite numbers, booleans and null. Everything else (DOM nodes,
 * Errors, functions, undefined, symbols, bigints) is dropped.
 * @param {any} value
 * @returns {string|number|boolean|null|undefined}
 */
function sanitizePrimitive(value) {
    if (value === null) return null;
    switch (typeof value) {
        case 'string':
            return truncate(value.replace(JID_PATTERN, '[jid]'));
        case 'number':
            return Number.isFinite(value) ? value : null;
        case 'boolean':
            return value;
        default:
            return undefined;
    }
}

/**
 * @param {any} data
 * @returns {Record<string, any>}
 */
function sanitize(data) {
    const result = {};
    if (!isPlainObject(data)) return result;

    for (const [key, value] of Object.entries(data)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;

        if (Array.isArray(value)) {
            const list = value
                .map((item) => sanitizePrimitive(item))
                .filter((item) => item !== undefined)
                .slice(0, 100);
            if (list.length) result[key] = list;
        } else if (isPlainObject(value)) {
            const nested = {};
            for (const [nested_key, nested_value] of Object.entries(value)) {
                if (SENSITIVE_KEYS.has(nested_key.toLowerCase())) continue;
                const primitive = sanitizePrimitive(nested_value);
                if (primitive !== undefined) nested[nested_key] = primitive;
            }
            if (Object.keys(nested).length) result[key] = nested;
        } else {
            const primitive = sanitizePrimitive(value);
            if (primitive !== undefined) result[key] = primitive;
        }
    }
    return result;
}

/**
 * @param {any} conn
 * @returns {'websocket'|'bosh'|undefined}
 */
function getTransport(conn) {
    if (!conn || typeof conn.isType !== 'function') return undefined;
    try {
        if (conn.isType('websocket')) return 'websocket';
        if (conn.isType('bosh')) return 'bosh';
    } catch (_error) {
        /* the transport may be half torn down */
    }
    return undefined;
}

/**
 * A snapshot of the state around every event, so the event itself stays small.
 * @returns {Record<string, any>}
 */
function contextSnapshot() {
    const conn = api.connection?.get?.();
    const retry = conn?.retry_info;
    return {
        status: constants.CONNECTION_STATUS[conn?.status] ?? conn?.status,
        authenticated: !!api.connection?.authenticated?.(),
        connected: !!api.connection?.connected?.(),
        has_connected: !!conn?.has_connected,
        reconnecting: !!conn?.reconnecting,
        transport: getTransport(conn),
        retries: Number.isFinite(retry?.retries) ? retry.retries : undefined,
        retry_at: Number.isFinite(retry?.retry_at) ? retry.retry_at : undefined,
        visible: document.visibilityState,
        online: navigator.onLine,
    };
}

/**
 * @returns {boolean}
 */
function hasSessionCookie() {
    return document.cookie.split('; ').some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/**
 * @returns {string}
 */
function getVersion() {
    return (
        getSetting('isacloud_version') ||
        document.querySelector('meta[name="isacloud-version"]')?.getAttribute('content') ||
        ''
    );
}

/**
 * @returns {string}
 */
function getPlatform() {
    const data = /** @type {any} */ (navigator).userAgentData;
    return data?.platform || navigator.platform || '';
}

/**
 * @returns {boolean}
 */
function isPWA() {
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
    return !!(standalone || /** @type {any} */ (navigator).standalone);
}

/**
 * @returns {number}
 */
function hiddenFor() {
    return document.visibilityState === 'hidden' && hidden_since ? Date.now() - hidden_since : 0;
}

/**
 * Merges a settled list into the buffer without losing events recorded while
 * the store was still loading.
 * @param {Record<string, any>[]} stored
 * @returns {Record<string, any>[]}
 */
function mergeEntries(stored) {
    const seen = new Set();
    const merged = [];
    for (const entry of [...stored, ...entries]) {
        const key = `${entry.ts}|${entry.mono}|${entry.ev}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
    }
    return merged.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/**
 * Applies the retention window and the entry cap to the in-memory buffer.
 * @returns {void}
 */
function trimMemory() {
    const cutoff = retentionCutoff();
    entries = entries.filter((entry) => Date.parse(entry.ts) >= cutoff);
    const max = maxEntries();
    if (entries.length > max) entries = entries.slice(entries.length - max);
}

/**
 * @param {boolean} [force]
 * @returns {void}
 */
function maybePrune(force = false) {
    const now = Date.now();
    if (!force && now - last_prune_at < PRUNE_INTERVAL_MS) return;
    last_prune_at = now;
    store.prune(retentionCutoff());
}

/**
 * Adds an event to the buffer and the store. Synchronous and safe to call from
 * anywhere: it never throws and does nothing when diagnostics are disabled.
 * @param {string} event
 * @param {Record<string, any>} [data]
 * @returns {void}
 */
export function record(event, data = {}) {
    if (!isEnabled()) return;

    const payload = sanitize(data);
    const entry = {
        ...payload,
        ts: new Date().toISOString(),
        mono: Math.round(performance.now() * 10) / 10,
        ev: truncate(String(event)),
        ctx: contextSnapshot(),
    };

    entries.push(entry);
    trimMemory();
    store.append(entry);
    maybePrune();
}

/**
 * The in-memory buffer, trimmed to the retention window and entry cap.
 * @returns {Record<string, any>[]}
 */
export function getEntries() {
    trimMemory();
    return entries.map((entry) => ({ ...entry, ctx: { ...entry.ctx } }));
}

/**
 * Counts for the last 24 hours.
 * @returns {{total: number, disconnects: number, reconnects: number, last_disconnect_at: string|null, last_reconnect_at: string|null}}
 */
export function getSummary() {
    const cutoff = Date.now() - 24 * HOUR_MS;
    const recent = entries.filter((entry) => Date.parse(entry.ts) >= cutoff);
    let disconnects = 0;
    let reconnects = 0;
    let last_disconnect_at = null;
    let last_reconnect_at = null;

    for (const entry of recent) {
        if (entry.ev === 'disconnected') {
            disconnects += 1;
            last_disconnect_at = entry.ts;
        } else if (entry.ev === 'connection_status' && entry.status === 'DISCONNECTED') {
            disconnects += 1;
            last_disconnect_at = entry.ts;
        } else if (entry.ev === 'reconnected') {
            reconnects += 1;
            last_reconnect_at = entry.ts;
        } else if (entry.ev === 'connected' && entry.reconnected === true) {
            reconnects += 1;
            last_reconnect_at = entry.ts;
        }
    }

    return { total: recent.length, disconnects, reconnects, last_disconnect_at, last_reconnect_at };
}

/**
 * Empties the buffer and the store. `meta` is kept.
 * @returns {Promise<void>}
 */
export async function clear() {
    entries = [];
    last_tick = Date.now();
    await store.clearAll();
}

/**
 * @param {string} name
 * @param {EventTarget} target
 * @param {EventListener} handler
 * @returns {void}
 */
function listen(name, target, handler) {
    target.addEventListener(name, handler);
    cleanups.push(() => target.removeEventListener(name, handler));
}

/**
 * Installs the page lifecycle listeners and the `diagnosticEvent` bridge.
 * @returns {void}
 */
function installListeners() {
    listen('visibilitychange', document, () => {
        const state = document.visibilityState;
        let hidden_for_ms = 0;
        if (state === 'hidden') {
            hidden_since = Date.now();
        } else if (hidden_since) {
            hidden_for_ms = Date.now() - hidden_since;
            hidden_since = 0;
        }
        record('visibility', { state, hidden_for_ms });
    });

    listen('freeze', document, () => {
        frozen_since = Date.now();
        record('freeze', { hidden_for_ms: hiddenFor() });
    });

    listen('resume', document, () => {
        const frozen_for_ms = frozen_since ? Date.now() - frozen_since : 0;
        frozen_since = 0;
        record('resume', { frozen_for_ms });
    });

    listen('online', window, () => record('online', { online: navigator.onLine }));
    listen('offline', window, () => record('offline', { online: navigator.onLine }));

    listen('pagehide', window, (event) => {
        record('pagehide', { persisted: !!(/** @type {PageTransitionEvent} */ (event).persisted) });
        const now = new Date().toISOString();
        store.setMeta('last_clean', now);
        store.setMeta('last_alive', now);
        maybePrune(true);
    });

    listen('pageshow', window, (event) =>
        record('pageshow', { persisted: !!(/** @type {PageTransitionEvent} */ (event).persisted) }),
    );

    const connection = /** @type {any} */ (navigator).connection;
    if (connection?.addEventListener) {
        listen('change', connection, () =>
            record('network_change', {
                effectiveType: connection.effectiveType,
                rtt: connection.rtt,
                downlink: connection.downlink,
                saveData: connection.saveData,
            }),
        );
    }

    listen('error', window, (event) => {
        const error_event = /** @type {ErrorEvent} */ (event);
        record('window_error', {
            name: error_event.error?.name || 'Error',
            message: truncate(String(error_event.message ?? '')),
            filename: truncate(String(error_event.filename ?? '')),
            lineno: error_event.lineno,
        });
    });

    listen('unhandledrejection', window, (event) => {
        const reason = /** @type {PromiseRejectionEvent} */ (event).reason;
        let name = 'UnhandledRejection';
        let message = '';
        if (reason instanceof Error) {
            name = reason.name;
            message = reason.message;
        } else if (typeof reason === 'string') {
            message = reason;
        }
        record('unhandled_rejection', { name, message: truncate(message) });
    });

    /**
     * @param {{event?: string}} data
     */
    const onDiagnosticEvent = (data) => {
        if (!data || typeof data !== 'object' || typeof data.event !== 'string') return;
        const { event: _event, ...rest } = data;
        record(_event, rest);
    };
    api.listen.on('diagnosticEvent', onDiagnosticEvent);
    cleanups.push(() => api.listen.not('diagnosticEvent', onDiagnosticEvent));
}

/**
 * @returns {void}
 */
function startHeartbeat() {
    last_tick = Date.now();
    stopHeartbeat();
    heartbeat_timer = setInterval(() => {
        if (!isEnabled()) return;
        const now = Date.now();
        const gap_ms = last_tick ? now - last_tick : 0;
        const visible = document.visibilityState === 'visible';
        last_tick = now;
        store.setMeta('last_alive', new Date(now).toISOString());
        if (gap_ms > (visible ? VISIBLE_GAP_MS : HIDDEN_GAP_MS)) {
            record('timer_gap', { gap_ms, visible, hidden_for_ms: hiddenFor() });
        }
    }, HEARTBEAT_MS);
}

/**
 * @returns {void}
 */
function stopHeartbeat() {
    if (heartbeat_timer !== null) clearInterval(heartbeat_timer);
    heartbeat_timer = null;
}

/**
 * Hydrates the buffer from the store, prunes it, and records `app_start`.
 * Idempotent. The lifecycle listeners are installed synchronously, before the
 * first await, so no event between the import and the store load is lost.
 * @returns {Promise<void>}
 */
export async function start() {
    if (started_promise) return started_promise;

    const current_generation = generation;
    installListeners();

    started_promise = (async () => {
        const cutoff = retentionCutoff();

        try {
            const stored = await store.readSince(cutoff);
            if (current_generation !== generation) return;
            entries = mergeEntries(stored);
            trimMemory();
            await store.prune(cutoff);
            last_prune_at = Date.now();
        } catch (error) {
            log.warn(`isacloud-diagnostics: could not load the store: ${error}`);
        }

        if (current_generation !== generation) return;

        const [last_alive, last_clean] = await Promise.all([store.getMeta('last_alive'), store.getMeta('last_clean')]);
        if (current_generation !== generation) return;

        const unclean_start = !!last_alive && (!last_clean || Date.parse(last_clean) < Date.parse(last_alive));

        record('app_start', {
            session_cookie: hasSessionCookie(),
            version: getVersion(),
            user_agent: navigator.userAgent,
            platform: getPlatform(),
            pwa: isPWA(),
            keepalive: !!getSetting('keepalive'),
            trusted: !!_converse.state?.config?.get?.('trusted'),
            persistent_store: getSetting('persistent_store'),
            ping_interval: getSetting('ping_interval'),
            enable_smacks: !!getSetting('enable_smacks'),
            auto_reconnect: !!getSetting('auto_reconnect'),
            transport: contextSnapshot().transport,
            last_alive: last_alive ?? null,
            last_clean: last_clean ?? null,
            unclean_start,
        });

        if (isEnabled()) startHeartbeat();
        started = true;
        resolve_ready();
    })().catch((error) => {
        log.warn(`isacloud-diagnostics: could not start: ${error}`);
        resolve_ready();
    });

    return started_promise;
}

/**
 * Internal: removes the listeners, stops the heartbeat and clears both buffers,
 * so a spec can start over. Not part of the public API.
 * @returns {Promise<void>}
 */
export async function _resetForTests() {
    generation += 1;
    started_promise = null;
    started = false;
    stopHeartbeat();
    for (const cleanup of cleanups) {
        try {
            cleanup();
        } catch (_error) {
            /* already removed */
        }
    }
    cleanups = [];
    entries = [];
    last_tick = 0;
    last_prune_at = 0;
    hidden_since = 0;
    frozen_since = 0;
    await store._resetForTests();
}

/**
 * Whether `start()` has finished hydrating and recording `app_start`.
 * @returns {boolean}
 */
export function isStarted() {
    return started;
}

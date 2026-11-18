/**
 * @description
 *  isaCloud: builds the connection diagnostics report and downloads it as a
 *  JSON file.
 *
 *  The download path must keep working when there is no connection, no upload
 *  service and no OMEMO: it only needs the in-memory buffer from `recorder.js`.
 *  The file is capped at roughly 1 MB, dropping the oldest entries first.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, converse } from '@converse/headless';
import { getEntries, getSummary } from './recorder.js';

/** Stop trimming when the file is under this many characters. */
const MAX_FILE_CHARS = 1_000_000;
/** Always keep the newest entries, even if they alone exceed the cap. */
const MIN_ENTRIES = 100;
const MAX_NOTE = 2000;

/**
 * @param {string} value
 * @param {number} limit
 * @returns {string}
 */
function truncate(value, limit) {
    return value.length > limit ? value.slice(0, limit) : value;
}

/**
 * @returns {string}
 */
function getVersion() {
    return (
        api.settings?.get?.('isacloud_version') ||
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
 * The high-entropy platform version tells Windows 11 from Windows 10, which
 * the frozen user agent no longer does. Best effort, with a short timeout.
 * @returns {Promise<{platform_version?: string, model?: string}>}
 */
async function getPlatformDetails() {
    const data = /** @type {any} */ (navigator).userAgentData;
    if (typeof data?.getHighEntropyValues !== 'function') return {};
    try {
        const details = await Promise.race([
            data.getHighEntropyValues(['platformVersion', 'model']),
            new Promise((resolve) => setTimeout(() => resolve({}), 500)),
        ]);
        return {
            platform_version: typeof details?.platformVersion === 'string' ? details.platformVersion : undefined,
            model: typeof details?.model === 'string' && details.model ? details.model : undefined,
        };
    } catch (_error) {
        return {};
    }
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
 * The account's own identity, and nothing about contacts or rooms.
 * @returns {{account: string|null, resource: string|null}}
 */
function getOwnIdentity() {
    const session = _converse.state?.session ?? _converse.session;
    return {
        account: session?.get?.('bare_jid') ?? null,
        resource: session?.get?.('resource') ?? null,
    };
}

/**
 * @param {any} report
 * @returns {string}
 */
function serialize(report) {
    return JSON.stringify(report, null, 2);
}

/**
 * Drops the oldest entries until the serialized report fits the cap, keeping at
 * least the last {@link MIN_ENTRIES}.
 * @param {any} report
 * @returns {any}
 */
function fitToSize(report) {
    if (serialize(report).length <= MAX_FILE_CHARS) return report;

    const total = report.entries.length;
    if (total <= MIN_ENTRIES) return report;

    let low = 0;
    let high = total - MIN_ENTRIES;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = { ...report, entries: report.entries.slice(middle) };
        if (serialize(candidate).length <= MAX_FILE_CHARS) {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    return { ...report, entries: report.entries.slice(low) };
}

/**
 * Builds the report from the in-memory buffer, without reading the store.
 * @param {string} [note] - Optional text from the user.
 * @returns {Promise<object>}
 */
export async function buildReport(note = '') {
    const identity = getOwnIdentity();
    const platform_details = await getPlatformDetails();
    const report = {
        meta: {
            generated_at: new Date().toISOString(),
            release: converse.env.VERSION_NAME ?? null,
            version: getVersion(),
            user_agent: navigator.userAgent,
            platform: getPlatform(),
            ...platform_details,
            pwa: isPWA(),
            transport: getTransport(api.connection?.get?.()),
            retention_hours: Number(api.settings?.get?.('isacloud_diagnostics_hours')) || 24,
            account: identity.account,
            resource: identity.resource,
            summary: getSummary(),
            note: truncate(String(note ?? ''), MAX_NOTE),
        },
        entries: getEntries(),
    };
    return fitToSize(report);
}

/**
 * File name without colons, so it is valid on Windows too. The release version
 * is included because the recipient's client shows this name, and the upload
 * service keeps it in the URL path (the only metadata that survives OMEMO).
 * @returns {string}
 */
function reportFileName() {
    const release = String(converse.env.VERSION_NAME ?? '').replace(/^v(\d+)-(\d+)$/, 'v$1.$2');
    const safe_release = release.replace(/[^A-Za-z0-9._-]/g, '') || 'dev';
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    return `isacloud-web-${safe_release}-${stamp}.json`;
}

/**
 * @param {string} [note]
 * @returns {Promise<File>}
 */
export async function createReportFile(note = '') {
    const report = await buildReport(note);
    return new File([serialize(report)], reportFileName(), { type: 'application/json' });
}

/**
 * Downloads the report as a JSON file. Works without a connection.
 * @param {string} [note]
 * @returns {Promise<File>} The file that was offered for download.
 */
export async function downloadReport(note = '') {
    const file = await createReportFile(note);
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return file;
}

/**
 * @description
 *  isaCloud: where a conference host URL is kept, so that the person who
 *  created the room can come back as its host by clicking the public link in
 *  the chat.
 *
 *  There is a single `localStorage` key, `isacloud-conference`, shared by every
 *  account on the origin. Rooms are therefore scoped by the account's bare JID:
 *  after a logout, another account must not inherit the first one's host URLs.
 *  Entries expire with the room (the server gives them 24 hours) and each
 *  account keeps at most {@link MAX_ROOMS_PER_ACCOUNT}.
 *
 *  The storage is user-editable, so everything read back is validated again:
 *  malformed JSON, wrong fields, expired entries and host URLs on another host
 *  are dropped. A host URL is a credential and never goes into a log.
 * @license Mozilla Public License (MPLv2)
 */
import { log } from '@converse/headless';
import { DEFAULT_CONFERENCE_URL, ROOM_ID_PATTERN, isHostURLForRoom, isMeetURL } from './links.js';

/** The single storage key, and the format version it holds. */
export const STORAGE_KEY = 'isacloud-conference';
export const STORAGE_VERSION = 1;

/** How many rooms one account keeps; the oldest are dropped first. */
export const MAX_ROOMS_PER_ACCOUNT = 20;

let warned_about_storage = false;

/**
 * `localStorage`, or `null` when the browser refuses to give it (old private
 * modes, disabled storage). Warns once, without any token.
 * @returns {Storage|null}
 */
function getStorage() {
    let storage;
    try {
        storage = globalThis.localStorage ?? null;
    } catch {
        storage = null;
    }
    if (!storage) warnUnavailable();
    return storage;
}

/** @returns {void} */
function warnUnavailable() {
    if (warned_about_storage) return;
    warned_about_storage = true;
    log.warn('isacloud-conference: localStorage is unavailable, host URLs will not be remembered');
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Milliseconds since the epoch for an expiry, or `NaN` when it cannot be read.
 * The meet-api may send nanoseconds (as a number or a numeric string), which
 * `Date` would otherwise read as milliseconds.
 * @param {unknown} value
 * @returns {number}
 */
function expiryTime(value) {
    let ms;
    if (typeof value === 'number') {
        ms = value;
    } else if (typeof value === 'string' && value) {
        ms = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    } else {
        return NaN;
    }
    if (!Number.isFinite(ms)) return NaN;
    if (ms > 1e14) ms = Math.floor(ms / 1e6);
    return new Date(ms).getTime();
}

/**
 * Whether a stored room can still be trusted and has not expired.
 * @param {unknown} record
 * @param {string} base
 * @returns {boolean}
 */
function isValidRecord(record, base) {
    if (!isObject(record)) return false;
    if (typeof record.hostURL !== 'string' || !isMeetURL(record.hostURL, base)) return false;
    if (typeof record.hostKey !== 'string' || !record.hostKey) return false;
    if (!Number.isFinite(expiryTime(record.expiresAt))) return false;
    if (!Number.isFinite(expiryTime(record.savedAt))) return false;
    return expiryTime(record.expiresAt) > Date.now();
}

/**
 * Drops invalid and expired rooms, then keeps the most recently saved ones, up
 * to the per-account limit.
 * @param {Record<string, any>} rooms
 * @param {string} base
 * @returns {Record<string, any>}
 */
function pruneAccount(rooms, base) {
    const valid = Object.entries(rooms).filter(
        ([room_id, record]) => ROOM_ID_PATTERN.test(room_id) && isValidRecord(record, base),
    );
    valid.sort(([, a], [, b]) => expiryTime(b.savedAt) - expiryTime(a.savedAt));
    return Object.fromEntries(valid.slice(0, MAX_ROOMS_PER_ACCOUNT));
}

/**
 * Reads and sanitises the whole key. Anything unexpected yields an empty set
 * rather than an exception, so that creating a conference still works after
 * the storage was corrupted.
 * @param {string} base
 * @returns {{ version: number, accounts: Record<string, Record<string, any>> }}
 */
function readAll(base) {
    const empty = { version: STORAGE_VERSION, accounts: /** @type {Record<string, any>} */ ({}) };
    const storage = getStorage();
    if (!storage) return empty;

    let raw;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        warnUnavailable();
        return empty;
    }
    if (!raw) return empty;

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        return empty;
    }
    if (!isObject(data) || data.version !== STORAGE_VERSION || !isObject(data.accounts)) return empty;

    /** @type {Record<string, Record<string, any>>} */
    const accounts = {};
    for (const [bare_jid, rooms] of Object.entries(data.accounts)) {
        if (!isObject(rooms)) continue;
        const clean = pruneAccount(rooms, base);
        if (Object.keys(clean).length) accounts[bare_jid] = clean;
    }
    return { version: STORAGE_VERSION, accounts };
}

/**
 * @param {{ version: number, accounts: Record<string, any> }} data
 * @returns {void}
 */
function writeAll(data) {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        warnUnavailable();
    }
}

/**
 * Remembers the host URL of a room for one account.
 * @param {string} bare_jid
 * @param {{ roomID: string, hostURL: string, hostKey: string, expiresAt: string|number }} room
 * @param {string} [base]
 * @returns {void}
 */
export function saveRoom(bare_jid, room, base = DEFAULT_CONFERENCE_URL) {
    if (!bare_jid || !isObject(room)) return;
    if (typeof room.roomID !== 'string' || !ROOM_ID_PATTERN.test(room.roomID)) return;
    if (!isHostURLForRoom(room.hostURL, room.roomID, base)) return;
    if (typeof room.hostKey !== 'string' || !room.hostKey) return;
    if (!Number.isFinite(expiryTime(room.expiresAt)) || expiryTime(room.expiresAt) <= Date.now()) return;

    const data = readAll(base);
    const account = isObject(data.accounts[bare_jid]) ? data.accounts[bare_jid] : {};
    account[room.roomID] = {
        hostURL: room.hostURL,
        hostKey: room.hostKey,
        expiresAt: room.expiresAt,
        savedAt: Date.now(),
    };
    data.accounts[bare_jid] = pruneAccount(account, base);
    writeAll(data);
}

/**
 * The host URL of a room for one account, or `null` when there is none, it has
 * expired, or it does not point at the conference service.
 * @param {string} bare_jid
 * @param {string} room_id
 * @param {string} [base]
 * @returns {string|null}
 */
export function getHostURL(bare_jid, room_id, base = DEFAULT_CONFERENCE_URL) {
    if (!bare_jid || typeof room_id !== 'string' || !ROOM_ID_PATTERN.test(room_id)) return null;
    const data = readAll(base);
    const record = data.accounts[bare_jid]?.[room_id];
    if (!isValidRecord(record, base)) return null;
    // The storage is user-editable: a host URL on the right host but on another
    // path (`/join/…`, say) must not be opened as this room's host page.
    if (!isHostURLForRoom(record.hostURL, room_id, base)) return null;
    return record.hostURL;
}

/**
 * Forgets every room of one account, for example on logout.
 * @param {string} bare_jid
 * @param {string} [base]
 * @returns {void}
 */
export function clearAccount(bare_jid, base = DEFAULT_CONFERENCE_URL) {
    if (!bare_jid) return;
    const data = readAll(base);
    if (!(bare_jid in data.accounts)) return;
    delete data.accounts[bare_jid];
    writeAll(data);
}

/**
 * @description
 *  isaCloud: the IndexedDB store behind the connection diagnostics.
 *
 *  This database is deliberately independent from Converse's per-account
 *  stores: diagnostics must survive logout, a cleared session and a reload,
 *  and must be writable before the user logs in. If IndexedDB is unavailable
 *  (private mode, quota, a blocked upgrade), every operation falls back to an
 *  in-memory copy so that the current page session can still be diagnosed and
 *  downloaded.
 *
 *  None of these functions throw: the recorder calls them without awaiting.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */

const DB_NAME = 'isacloud-diagnostics';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const META = 'meta';
const TS_INDEX = 'ts';

/** @type {Promise<IDBDatabase>|null} */
let db_promise = null;

/** Entries kept in memory after IndexedDB failed, or because it is unavailable. */
/** @type {object[]} */
const memory_entries = [];

/** @type {Map<string, any>} */
const memory_meta = new Map();

let using_fallback = false;

/**
 * Whether the page has IndexedDB at all.
 * @returns {boolean}
 */
export function isAvailable() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Copies an entry and guarantees a string `ts`, so that the `ts` index always
 * holds lexicographically sortable ISO dates.
 * @param {any} entry
 * @returns {object|null}
 */
function normalize(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const copy = { ...entry };
    if (typeof copy.ts === 'number') {
        copy.ts = new Date(copy.ts).toISOString();
    } else if (typeof copy.ts !== 'string') {
        copy.ts = new Date().toISOString();
    }
    return copy;
}

/**
 * @param {number|string|Date} cutoff
 * @returns {string}
 */
function cutoffToISO(cutoff) {
    if (cutoff instanceof Date) return cutoff.toISOString();
    if (typeof cutoff === 'string') {
        const parsed = Date.parse(cutoff);
        return new Date(Number.isFinite(parsed) ? parsed : 0).toISOString();
    }
    const ms = Number(cutoff);
    return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

/**
 * @param {number|string|Date} cutoff
 * @returns {number}
 */
function cutoffToMs(cutoff) {
    if (cutoff instanceof Date) return cutoff.getTime();
    if (typeof cutoff === 'string') {
        const parsed = Date.parse(cutoff);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const ms = Number(cutoff);
    return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** @returns {Promise<IDBDatabase>} */
function openDatabase() {
    if (!isAvailable()) return Promise.reject(new Error('IndexedDB is not available'));
    if (db_promise) return db_promise;

    db_promise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            let entries;
            if (!db.objectStoreNames.contains(ENTRIES)) {
                entries = db.createObjectStore(ENTRIES, { autoIncrement: true });
            } else {
                entries = request.transaction.objectStore(ENTRIES);
            }
            if (!entries.indexNames.contains(TS_INDEX)) {
                entries.createIndex(TS_INDEX, 'ts', { unique: false });
            }
            if (!db.objectStoreNames.contains(META)) {
                db.createObjectStore(META, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    }).catch((error) => {
        using_fallback = true;
        db_promise = null;
        throw error;
    });

    return db_promise;
}

/**
 * Runs `callback` in a transaction and resolves once the transaction completes
 * (or with the promise returned by the callback, if any).
 * @param {IDBDatabase} db
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => any} callback
 * @returns {Promise<any>}
 */
function inTransaction(db, mode, callback) {
    return new Promise((resolve, reject) => {
        let transaction;
        try {
            transaction = db.transaction(ENTRIES, mode);
        } catch (error) {
            reject(error);
            return;
        }
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        try {
            result = callback(transaction.objectStore(ENTRIES));
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * @param {number|string|Date} cutoff
 * @returns {object[]}
 */
function memorySince(cutoff) {
    const cutoff_ms = cutoffToMs(cutoff);
    return memory_entries
        .filter((entry) => Date.parse(entry.ts) >= cutoff_ms)
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/**
 * Appends an entry. Safe to call without awaiting: failures are swallowed and
 * the entry stays readable from memory.
 * @param {object} entry
 * @returns {Promise<void>}
 */
export async function append(entry) {
    const record = normalize(entry);
    if (!record) return;

    if (using_fallback || !isAvailable()) {
        memory_entries.push(record);
        return;
    }

    try {
        const db = await openDatabase();
        await inTransaction(db, 'readwrite', (store) => store.add(record));
    } catch (_error) {
        using_fallback = true;
        memory_entries.push(record);
    }
}

/**
 * Entries with `ts >= cutoff`, oldest first.
 * @param {number|string|Date} cutoff
 * @returns {Promise<object[]>}
 */
export async function readSince(cutoff) {
    if (using_fallback || !isAvailable()) return memorySince(cutoff);

    try {
        const db = await openDatabase();
        const range = IDBKeyRange.lowerBound(cutoffToISO(cutoff));
        const entries = await inTransaction(db, 'readonly', (store) =>
            requestResult(store.index(TS_INDEX).getAll(range)),
        );
        return entries.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    } catch (_error) {
        using_fallback = true;
        return memorySince(cutoff);
    }
}

/**
 * Deletes entries older than the cutoff and drops the same range from memory.
 * @param {number|string|Date} cutoff
 * @returns {Promise<void>}
 */
export async function prune(cutoff) {
    const cutoff_ms = cutoffToMs(cutoff);

    // Memory is always pruned, whether IndexedDB works or not.
    for (let i = memory_entries.length - 1; i >= 0; i -= 1) {
        if (Date.parse(memory_entries[i].ts) < cutoff_ms) memory_entries.splice(i, 1);
    }

    if (using_fallback || !isAvailable()) return;

    try {
        const db = await openDatabase();
        await inTransaction(db, 'readwrite', (store) => {
            const range = IDBKeyRange.upperBound(cutoffToISO(cutoff), true);
            const request = store.index(TS_INDEX).openCursor(range);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                store.delete(cursor.primaryKey);
                cursor.continue();
            };
        });
    } catch (_error) {
        using_fallback = true;
    }
}

/**
 * Empties `entries` but keeps `meta`.
 * @returns {Promise<void>}
 */
export async function clearAll() {
    memory_entries.length = 0;

    if (using_fallback || !isAvailable()) return;

    try {
        const db = await openDatabase();
        await inTransaction(db, 'readwrite', (store) => store.clear());
    } catch (_error) {
        using_fallback = true;
    }
}

/**
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getMeta(key) {
    if (using_fallback || !isAvailable()) return memory_meta.get(key);

    try {
        const db = await openDatabase();
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(META, 'readonly');
            const request = transaction.objectStore(META).get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    } catch (_error) {
        using_fallback = true;
        return memory_meta.get(key);
    }
}

/**
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function setMeta(key, value) {
    if (using_fallback || !isAvailable()) {
        memory_meta.set(key, value);
        return;
    }

    try {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(META, 'readwrite');
            transaction.objectStore(META).put({ key, value });
            transaction.oncomplete = () => resolve(undefined);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } catch (_error) {
        using_fallback = true;
        memory_meta.set(key, value);
    }
}

/**
 * Internal: forgets the cached connection and the in-memory copies, so a test
 * can start from a clean database. Not part of the public API.
 * @returns {Promise<void>}
 */
export async function _resetForTests() {
    memory_entries.length = 0;
    memory_meta.clear();
    using_fallback = false;
    db_promise = null;
    await clearAll();
}

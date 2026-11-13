/**
 * @description
 *  isaCloud: the local sticker library (phase 2).
 *
 *  Stored in its own IndexedDB database, `isacloud-stickers`, apart from
 *  Converse's storage: it survives logout and cache clearing. It belongs to
 *  the browser, not the account, as the iOS library belongs to the device.
 *
 *  Every function resolves instead of throwing: when IndexedDB is missing or
 *  fails, the library behaves as empty and the error is logged. The one
 *  exception is `addSticker`, which resolves to `null` on failure, so the
 *  caller can tell the user that the sticker was not saved.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { log } from '@converse/headless';

const DB_NAME = 'isacloud-stickers';
const DB_VERSION = 1;
const STORE = 'stickers';

/** @type {Promise<IDBDatabase>|null} */
let db_promise = null;

/**
 * @typedef {Object} StickerRecord
 * @property {string} id - A UUID.
 * @property {Blob} blob - The PNG, 512 x 512 with a transparent background.
 * @property {string} created - ISO 8601 time the sticker was added.
 * @property {string|null} last_used - ISO 8601 time the sticker was last sent, or null.
 * @property {boolean} favorite
 * @property {string} sha256 - Hex digest of the PNG, used to avoid duplicates.
 */

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    if (!db_promise) {
        db_promise = new Promise((resolve, reject) => {
            if (!globalThis.indexedDB) {
                reject(new Error('IndexedDB is not available'));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('sha256', 'sha256', { unique: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch((e) => {
            // Let a later call try again.
            db_promise = null;
            throw e;
        });
    }
    return db_promise;
}

/**
 * Runs `work` in one transaction and resolves with what it returns once the
 * transaction has committed.
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function transaction(mode, work) {
    const db = await openDB();
    const tx = db.transaction(STORE, mode);
    const committed = new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('The sticker transaction was aborted'));
    });
    // If `work` fails, the transaction aborts and `committed` rejects, which
    // nobody awaits in that case.
    committed.catch(() => {});
    const value = await work(tx.objectStore(STORE));
    await committed;
    return value;
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>} The SHA-256 digest, in lower-case hex.
 */
async function sha256Hex(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Newest use first; never-used stickers come after the used ones, newest added first.
 * @param {StickerRecord} a
 * @param {StickerRecord} b
 */
function byRecentUse(a, b) {
    return compare(b.last_used ?? '', a.last_used ?? '') || compare(b.created, a.created);
}

/**
 * @param {string} a
 * @param {string} b
 */
function compare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {{ favorites?: boolean }} [options]
 * @returns {Promise<StickerRecord[]>} The stickers, most recently used first.
 */
export async function listStickers({ favorites = false } = {}) {
    try {
        const records = await transaction('readonly', (store) => requestToPromise(store.getAll()));
        return records.filter((record) => !favorites || record.favorite).sort(byRecentUse);
    } catch (e) {
        log.error(e);
        return [];
    }
}

/**
 * Adds a sticker, unless one with the same content is already in the library.
 * @param {Blob} blob - A PNG already normalised by `toStickerPNG`.
 * @returns {Promise<StickerRecord|null>} The stored sticker (the existing one for a duplicate), or null on failure.
 */
export async function addSticker(blob) {
    try {
        const sha256 = await sha256Hex(blob);
        return await transaction('readwrite', async (store) => {
            const [existing] = await requestToPromise(store.index('sha256').getAll(sha256));
            if (existing) return existing;

            /** @type {StickerRecord} */
            const record = {
                id: crypto.randomUUID(),
                blob,
                created: new Date().toISOString(),
                last_used: null,
                favorite: false,
                sha256,
            };
            await requestToPromise(store.add(record));
            return record;
        });
    } catch (e) {
        log.error(e);
        return null;
    }
}

/**
 * Updates one record. Resolves to `false` when there is no such sticker.
 * @param {string} id
 * @param {(record: StickerRecord) => StickerRecord} change
 * @returns {Promise<boolean>}
 */
async function updateRecord(id, change) {
    try {
        return await transaction('readwrite', async (store) => {
            const record = await requestToPromise(store.get(id));
            if (!record) return false;
            await requestToPromise(store.put(change(record)));
            return true;
        });
    } catch (e) {
        log.error(e);
        return false;
    }
}

/**
 * @param {string} id
 * @param {boolean} favorite
 * @returns {Promise<boolean>}
 */
export function setFavorite(id, favorite) {
    return updateRecord(id, (record) => ({ ...record, favorite: !!favorite }));
}

/**
 * Records that the sticker was sent now, which moves it up the list.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export function touchSticker(id) {
    return updateRecord(id, (record) => ({ ...record, last_used: new Date().toISOString() }));
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteSticker(id) {
    try {
        await transaction('readwrite', (store) => requestToPromise(store.delete(id)));
        return true;
    } catch (e) {
        log.error(e);
        return false;
    }
}

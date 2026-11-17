/**
 * @description
 *  isaCloud: importing a GIF as a sticker (phase 1c). A GIF comes either from a
 *  direct link (`gifFromURL`) or from a file the user picks; in both cases it is
 *  kept byte for byte, so that it keeps animating, and `importGif` stores it in
 *  the library and sends it to the chat.
 *
 *  The link is downloaded without credentials or referrer, with a timeout, and
 *  only `http:` and `https:` are accepted. The body is read in chunks, so that a
 *  huge file is refused without being held in memory. As everywhere in the
 *  plugin, the format is sniffed from the first bytes, never taken from the name
 *  or from `Content-Type`: an HTML error page is not a GIF.
 *
 *  Every failure is an `Error` with a `code`, so that the UI can translate it.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { MAX_STICKER_BYTES, detectStickerFormat } from './format.js';
import { addSticker, touchSticker } from './library.js';
import { sendSticker } from './send.js';

/**
 * @typedef {'invalid-url'|'download'|'timeout'|'too-large'|'not-gif'|'store'} StickerImportErrorCode
 */

/** The link is not an `http(s)` URL. */
const INVALID_URL = 'invalid-url';
/** The GIF could not be downloaded, or the server answered with an error. */
const DOWNLOAD = 'download';
/** The download took longer than the timeout. */
const TIMEOUT = 'timeout';
/** The GIF is larger than `MAX_STICKER_BYTES`. */
const TOO_LARGE = 'too-large';
/** The bytes are not a GIF. */
const NOT_GIF = 'not-gif';
/** The sticker could not be stored in the library. */
const STORE = 'store';

/**
 * An `Error` with a code for the UI.
 * @param {StickerImportErrorCode} code
 * @param {string} message
 * @param {any} [cause]
 * @returns {Error & { code: StickerImportErrorCode }}
 */
function importError(code, message, cause) {
    const options = cause === undefined ? undefined : { cause };
    return Object.assign(new Error(message, options), { code });
}

/**
 * @param {any} error
 * @returns {boolean} Whether the error already carries a code of this module.
 */
function isImportError(error) {
    return error instanceof Error && typeof (/** @type {any} */ (error).code) === 'string';
}

/** @returns {Error & { code: StickerImportErrorCode }} */
function tooLarge() {
    return importError(TOO_LARGE, `The GIF is larger than ${MAX_STICKER_BYTES} bytes`);
}

/**
 * Reads the body of a response in chunks, refusing it as soon as it is larger
 * than a sticker may be. The check is repeated for `content-length` before the
 * body is read, so that an announced large file is not downloaded at all.
 * @param {Response} response
 * @returns {Promise<BlobPart[]>}
 */
async function readChunks(response) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_STICKER_BYTES) throw tooLarge();
        return [buffer];
    }

    /** @type {BlobPart[]} */
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_STICKER_BYTES) {
            await reader.cancel().catch(() => {});
            throw tooLarge();
        }
        chunks.push(value);
    }
    return chunks;
}

/**
 * Reads a response into a GIF Blob. A redirect is followed by `fetch` itself,
 * so the final URL is checked instead of the one that was asked for.
 * @param {Response} response
 * @returns {Promise<Blob>}
 */
async function readGIF(response) {
    if (!response.ok) throw importError(DOWNLOAD, `The GIF could not be downloaded (HTTP ${response.status})`);

    if (response.url) {
        let final_url;
        try {
            final_url = new URL(response.url);
        } catch {
            final_url = null;
        }
        if (final_url && final_url.protocol !== 'http:' && final_url.protocol !== 'https:') {
            throw importError(INVALID_URL, `The GIF was redirected to ${final_url.protocol}`);
        }
    }

    const declared = Number(response.headers?.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_STICKER_BYTES) throw tooLarge();

    const blob = new Blob(await readChunks(response), { type: 'image/gif' });
    if ((await detectStickerFormat(blob)) !== 'gif') throw importError(NOT_GIF, 'The bytes are not a GIF');
    return blob;
}

/**
 * Downloads a GIF from a direct link. Only `http:` and `https:` are accepted,
 * without credentials or referrer; the download is aborted after `timeout_ms`.
 * @param {string} url
 * @param {{ timeout_ms?: number }} [options]
 * @returns {Promise<Blob>} The bytes, typed `image/gif`, once they are known to be a GIF.
 * @throws {Error & { code: StickerImportErrorCode }} With `invalid-url`, `download`, `timeout`, `too-large` or `not-gif`.
 */
export async function gifFromURL(url, { timeout_ms = 15000 } = {}) {
    /** @type {URL} */
    let target;
    try {
        target = new URL(url);
    } catch (e) {
        throw importError(INVALID_URL, 'The link is not a URL', e);
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw importError(INVALID_URL, `The link is not http(s): ${target.protocol}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout_ms);
    try {
        const response = await fetch(target.href, {
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
        return await readGIF(response);
    } catch (e) {
        if (isImportError(e)) throw e;
        // DOMException is not an `Error` with a string code, so an aborted read lands here too.
        throw controller.signal.aborted
            ? importError(TIMEOUT, 'The GIF took too long to download', e)
            : importError(DOWNLOAD, 'The GIF could not be downloaded', e);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Stores a GIF in the library and sends it to the chat, as a GIF.
 * @param {any} chat - The chat the sticker is sent to.
 * @param {Blob} blob - The bytes of a GIF, as `gifFromURL` or the file input returns them.
 * @returns {Promise<import('./library.js').StickerRecord>} The stored sticker.
 * @throws {Error & { code: StickerImportErrorCode }} With `store` when the sticker could not be stored.
 */
export async function importGif(chat, blob) {
    const sticker = await addSticker(blob, 'gif');
    if (!sticker) throw importError(STORE, 'The sticker could not be stored');
    await touchSticker(sticker.id);
    await sendSticker(chat, sticker.blob, 'gif');
    return sticker;
}

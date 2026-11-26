/**
 * @description
 *  isaCloud: the image formats a sticker can have (phase 1 of GIF stickers).
 *
 *  A sticker is a PNG (512 x 512, made by the editor or by `toStickerPNG`) or a
 *  GIF, which is stored and sent untouched so that it keeps animating. The
 *  format is always sniffed from the first bytes of the file: names and
 *  `Blob.type` can be wrong or missing, and the iOS and Android clients also go
 *  by the bytes.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */

/** Largest GIF sticker kept in the library or sent, in bytes. */
export const MAX_STICKER_BYTES = 16 * 1024 * 1024;

/** 89 50 4E 47 0D 0A 1A 0A */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** "GIF8", the start of both GIF87a and GIF89a. */
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38];

/** Both signatures fit in the first eight bytes. */
const HEADER_BYTES = PNG_SIGNATURE.length;

/**
 * @param {Uint8Array} bytes
 * @param {number[]} signature
 * @returns {boolean}
 */
function startsWith(bytes, signature) {
    return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Detects the format of a sticker from its first bytes only. The extension and
 * `Blob.type` are ignored, as the iOS and Android clients ignore them.
 * @param {Blob} blob
 * @returns {Promise<'png'|'gif'|null>} Null for anything that is neither PNG nor GIF.
 */
export async function detectStickerFormat(blob) {
    const bytes = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
    if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
    if (startsWith(bytes, GIF_SIGNATURE)) return 'gif';
    return null;
}

/**
 * @param {'png'|'gif'} format
 * @returns {string} The MIME type the sticker is uploaded with.
 */
export function stickerMimeType(format) {
    return format === 'gif' ? 'image/gif' : 'image/png';
}

/**
 * @param {'png'|'gif'} format
 * @returns {string} The file extension, with the leading dot.
 */
export function stickerExtension(format) {
    return format === 'gif' ? '.gif' : '.png';
}

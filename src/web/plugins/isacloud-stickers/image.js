/**
 * @description
 *  isaCloud: turns an image into a sticker, a 512 x 512 transparent PNG (phase 2).
 *  The image is scaled to fit (enlarged or reduced), centred. Used for received
 *  stickers ("Save sticker"); a picked image goes through the editor instead.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */

export const STICKER_SIZE = 512;

/**
 * @param {Blob} blob - Any image the browser can decode.
 * @returns {Promise<Blob>} A PNG of STICKER_SIZE x STICKER_SIZE pixels.
 * @throws {Error} When the image cannot be decoded or encoded.
 */
export async function toStickerPNG(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        // Fit the whole image in the 512 frame, enlarging small images too, so that a
        // sticker always fills its frame.
        const scale = Math.min(STICKER_SIZE / bitmap.width, STICKER_SIZE / bitmap.height);
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = STICKER_SIZE;
        canvas.height = STICKER_SIZE;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, (STICKER_SIZE - width) / 2, (STICKER_SIZE - height) / 2, width, height);
        return await new Promise((resolve, reject) =>
            canvas.toBlob(
                (png) => (png ? resolve(png) : reject(new Error('The sticker could not be encoded as PNG'))),
                'image/png',
            ),
        );
    } finally {
        bitmap.close();
    }
}

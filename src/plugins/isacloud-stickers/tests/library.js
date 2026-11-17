import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };

/** @param {string} text - Makes each blob a different sticker. */
const blob = (text) => new Blob([text], { type: 'image/png' });

/** A real 1 x 1 GIF89a. */
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** @type {Uint8Array} */
const GIF_BYTES = Uint8Array.from(atob(GIF_BASE64), (char) => char.charCodeAt(0));

/** @returns {Blob} */
const gifBlob = () => new Blob([GIF_BYTES], { type: 'image/gif' });

/**
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Blob>} A solid PNG of the given size.
 */
async function makePNG(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff006f';
    context.fillRect(0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Empties the library, which is shared by the whole browser. */
async function clearLibrary(library) {
    for (const sticker of await library.listStickers()) {
        await library.deleteSticker(sticker.id);
    }
}

describe('The sticker library', function () {
    it(
        'keeps one copy of a sticker that is added twice',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const first = await library.addSticker(blob('same sticker'));
            const second = await library.addSticker(blob('same sticker'));
            expect(second.id).toBe(first.id);
            expect((await library.listStickers()).length).toBe(1);
        }),
    );

    it(
        'keeps different stickers apart',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            await library.addSticker(blob('one'));
            await library.addSticker(blob('two'));
            expect((await library.listStickers()).length).toBe(2);
        }),
    );

    it(
        'lists only the favourites when asked to',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const kept = await library.addSticker(blob('favourite'));
            await library.addSticker(blob('plain'));
            await library.setFavorite(kept.id, true);
            const favorites = await library.listStickers({ favorites: true });
            expect(favorites.map((s) => s.id)).toEqual([kept.id]);
            expect((await library.listStickers()).length).toBe(2);
        }),
    );

    it(
        'puts the most recently used sticker first, then the newest added',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const older = await library.addSticker(blob('older'));
            // Timestamps are to the millisecond, so wait for the next one.
            await new Promise((resolve) => setTimeout(resolve, 5));
            const newer = await library.addSticker(blob('newer'));
            expect((await library.listStickers()).map((s) => s.id)).toEqual([newer.id, older.id]);
            await library.touchSticker(older.id);
            expect((await library.listStickers()).map((s) => s.id)).toEqual([older.id, newer.id]);
        }),
    );

    it(
        'deletes a sticker',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const sticker = await library.addSticker(blob('to delete'));
            expect(await library.deleteSticker(sticker.id)).toBe(true);
            expect(await library.listStickers()).toEqual([]);
        }),
    );

    it(
        'detects the format from the bytes, not the type or the name',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { detectStickerFormat } = _converse.exports.isacloud_stickers;
            expect(await detectStickerFormat(gifBlob())).toBe('gif');
            // A GIF is a GIF whatever the type says.
            expect(await detectStickerFormat(new Blob([GIF_BYTES], { type: 'image/png' }))).toBe('gif');
            expect(await detectStickerFormat(await makePNG(8, 8))).toBe('png');
            expect(await detectStickerFormat(new Blob(['not an image']))).toBeNull();
            expect(await detectStickerFormat(new Blob([]))).toBeNull();
        }),
    );

    it(
        'stores a GIF untouched, with its format',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const sticker = await library.addSticker(gifBlob());
            expect(sticker.format).toBe('gif');
            expect(Array.from(new Uint8Array(await sticker.blob.arrayBuffer()))).toEqual(Array.from(GIF_BYTES));
        }),
    );

    it(
        'keeps one copy of a GIF that is added twice',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const first = await library.addSticker(gifBlob());
            const second = await library.addSticker(gifBlob(), 'gif');
            expect(second.id).toBe(first.id);
            expect((await library.listStickers()).length).toBe(1);
        }),
    );

    it(
        'records a PNG for a sticker that is neither PNG nor GIF',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const png = await library.addSticker(await makePNG(16, 16));
            expect(png.format).toBe('png');
            const unknown = await library.addSticker(blob('not really a PNG'));
            expect(unknown.format).toBe('png');
        }),
    );

    it(
        'refuses a GIF larger than the maximum sticker size',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { library, MAX_STICKER_BYTES } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            const large = new Blob([GIF_BYTES, new Uint8Array(MAX_STICKER_BYTES)], { type: 'image/gif' });
            expect(large.size).toBeGreaterThan(MAX_STICKER_BYTES);
            expect(await library.addSticker(large, 'gif')).toBeNull();
            expect(await library.listStickers()).toEqual([]);
        }),
    );

    it(
        'turns any image into a 512 by 512 PNG',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { toStickerPNG } = _converse.exports.isacloud_stickers;
            const output = await toStickerPNG(await makePNG(1000, 600));
            expect(output.type).toBe('image/png');
            const bitmap = await createImageBitmap(output);
            expect([bitmap.width, bitmap.height]).toEqual([512, 512]);
            bitmap.close();
        }),
    );
});

import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };
const SIDE = 512;

/**
 * @param {number} width
 * @param {number} height
 * @param {string} [color]
 * @returns {Promise<Blob>} A solid PNG.
 */
async function makePNG(width, height, color = '#ff0000') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * @param {Blob} blob
 * @returns {Promise<{ width: number, height: number, data: Uint8ClampedArray }>} The decoded pixels.
 */
async function pixelsOf(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();
    return { width: canvas.width, height: canvas.height, data };
}

/** @returns {Promise<ImageBitmap>} A bitmap of the given size and colour, as the editor's photo. */
async function bitmapOf(width, height, color) {
    return createImageBitmap(await makePNG(width, height, color));
}

/** Empties the library, which is shared by the whole browser. */
async function clearLibrary(library) {
    for (const sticker of await library.listStickers()) await library.deleteSticker(sticker.id);
}

/** Opens the picker and chooses an image as if the user had picked it with "+". */
async function pickImage(modal, blob) {
    const input = await u.waitUntil(() => modal.querySelector('input[type="file"]'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'photo.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    return u.waitUntil(() => modal.querySelector('converse-isacloud-sticker-editor'));
}

describe('The sticker editor', function () {
    it(
        'exports a 512 x 512 PNG',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { exportSticker } = _converse.exports.isacloud_stickers;
            const photo = await bitmapOf(300, 200, '#ff0000');
            const png = await exportSticker({ photo, zoom: 1, offset: { x: 0, y: 0 }, texts: [] });
            expect(png.type).toBe('image/png');
            const { width, height } = await pixelsOf(png);
            expect(width).toBe(SIDE);
            expect(height).toBe(SIDE);
        }),
    );

    it(
        'keeps the margin transparent and the crop square opaque',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { exportSticker } = _converse.exports.isacloud_stickers;
            const photo = await bitmapOf(300, 200, '#ff0000');
            const png = await exportSticker({ photo, zoom: 1, offset: { x: 0, y: 0 }, texts: [] });
            const { width, data } = await pixelsOf(png);
            const at = (x, y) => (y * width + x) * 4;
            // The margin is 6% of 512, about 31 px: (5, 5) is outside the crop square.
            expect(data[at(5, 5) + 3]).toBe(0);
            // The centre is inside the photo.
            expect(data[at(256, 256)]).toBeGreaterThan(250);
            expect(data[at(256, 256) + 1]).toBeLessThan(5);
            expect(data[at(256, 256) + 3]).toBe(255);
        }),
    );

    it(
        'limits the offset so that the crop square is never empty',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { clampOffset, photoLimit } = _converse.exports.isacloud_stickers;
            const photo = { width: 100, height: 100 };
            // Zoom 1 on a square photo covers the square exactly: no room to move.
            expect(photoLimit({ photo, zoom: 1 })).toEqual({ x: 0, y: 0 });
            const still = clampOffset({ photo, zoom: 1, offset: { x: 0.3, y: -0.3 } });
            expect(still.x).toBeCloseTo(0, 9);
            expect(still.y).toBeCloseTo(0, 9);
            // Zoom 2: the photo is twice the square, so it may move (2 frame - frame) / 2.
            const frame = 1 - 2 * 0.06;
            const limit = photoLimit({ photo, zoom: 2 });
            expect(limit.x).toBeCloseTo((2 * frame - frame) / 2, 6);
            const clamped = clampOffset({ photo, zoom: 2, offset: { x: 5, y: -5 } });
            expect(clamped.x).toBeCloseTo(limit.x, 9);
            expect(clamped.y).toBeCloseTo(-limit.y, 9);
        }),
    );

    it(
        'draws text in the margin, where it is not clipped',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { exportSticker } = _converse.exports.isacloud_stickers;
            const texts = [{ id: 't', text: 'HI', color_index: 0, x: 0.5, y: 0.97, scale: 1 }];
            const png = await exportSticker({ photo: null, zoom: 1, offset: { x: 0, y: 0 }, texts });
            const { width, height, data } = await pixelsOf(png);
            // The bottom margin is the last 6% of the side: rows from about 481 to 511.
            let painted = 0;
            for (let y = Math.floor(height * 0.94) + 4; y < height; y++) {
                for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 0) painted++;
            }
            expect(painted).toBeGreaterThan(0);
        }),
    );

    it(
        'outlines black text in white and the other colours in black',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { outlineColor } = _converse.exports.isacloud_stickers;
            expect(outlineColor(1)).toBe('#ffffff');
            expect(outlineColor(0)).toBe('#000000');
            expect(outlineColor(2)).toBe('#000000');
            expect(outlineColor(3)).toBe('#000000');
            expect(outlineColor(4)).toBe('#000000');
        }),
    );

    it(
        'wraps a long text into lines no wider than 90% of the side',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { layoutText } = _converse.exports.isacloud_stickers;
            const item = {
                text: 'a long sentence with many words that has to wrap into several lines',
                color_index: 0,
                x: 0.5,
                y: 0.5,
                scale: 1,
            };
            const layout = layoutText(item, SIDE);
            expect(layout.lines.length).toBeGreaterThan(1);
            const context = document.createElement('canvas').getContext('2d');
            context.font = layout.font;
            for (const line of layout.lines) {
                expect(context.measureText(line).width).toBeLessThanOrEqual(SIDE * 0.9 + 0.5);
            }
            // Wrapping loses no words.
            expect(layout.lines.join(' ').replace(/\s+/g, ' ')).toBe(item.text);
        }),
    );

    it(
        'saves the edited image to the library and shows the grid again',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library, openStickerPicker } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            openStickerPicker(view.model);
            const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));
            await u.waitUntil(() => modal.querySelector('input[type="file"]'));

            const editor = await pickImage(modal, await makePNG(200, 120, '#1780ad'));
            expect(modal.view).toBe('editor');
            expect(modal.getModalTitle()).toBe('Edit sticker');

            editor.querySelector('.sticker-editor__save').click();
            // The modal shows the grid only once the sticker is in the library.
            await u.waitUntil(() => modal.view === 'grid' && modal.querySelector('.isacloud-stickers__grid'));
            expect((await library.listStickers()).length).toBe(1);
            modal.close();
        }),
    );

    it(
        'leaves the library unchanged when the editor is cancelled',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library, openStickerPicker } = _converse.exports.isacloud_stickers;
            await clearLibrary(library);
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            openStickerPicker(view.model);
            const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));

            const editor = await pickImage(modal, await makePNG(200, 120));
            editor.querySelector('.sticker-editor__cancel').click();
            await u.waitUntil(() => modal.view === 'grid' && modal.querySelector('input[type="file"]'));
            expect((await library.listStickers()).length).toBe(0);
            modal.close();
        }),
    );
});

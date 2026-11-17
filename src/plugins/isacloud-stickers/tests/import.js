import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };

/** A real 1 x 1 GIF89a. */
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** @type {Uint8Array} */
const GIF_BYTES = Uint8Array.from(atob(GIF_BASE64), (char) => char.charCodeAt(0));

/** @returns {Blob} */
const gifBlob = () => new Blob([GIF_BYTES], { type: 'image/gif' });

/** @returns {Promise<Blob>} A solid PNG, which is not a GIF. */
async function makePNG() {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff006f';
    context.fillRect(0, 0, 8, 8);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * @param {Promise<any>} promise
 * @returns {Promise<any>} What the promise rejected with.
 */
async function failure(promise) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    throw new Error('The call was expected to fail');
}

/** @returns {string} JID of the first roster contact. */
const contactJID = () => mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/** Empties the library, which is shared by the whole browser. */
async function clearLibrary(library) {
    for (const sticker of await library.listStickers()) await library.deleteSticker(sticker.id);
}

/**
 * Opens the picker on an empty library and waits for the grid.
 * @param {any} _converse
 * @returns {Promise<any>} The modal element.
 */
async function openPicker(_converse) {
    const { library, openStickerPicker } = _converse.exports.isacloud_stickers;
    await clearLibrary(library);
    await mock.waitForRoster(_converse, 'current', 1);
    const view = await mock.openChatBoxFor(_converse, contactJID());
    openStickerPicker(view.model);
    const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));
    await u.waitUntil(() => modal.querySelector('.isacloud-stickers__empty'));
    return modal;
}

/**
 * @param {HTMLInputElement} input
 * @param {File} file
 */
function chooseFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
}

describe('Importing a GIF as a sticker', function () {
    it(
        'downloads a GIF from a link',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { gifFromURL } = _converse.exports.isacloud_stickers;
            vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(gifBlob(), { status: 200 }));

            const blob = await gifFromURL('https://example.org/cat.gif');
            expect(blob.type).toBe('image/gif');
            expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(GIF_BYTES));
        }),
    );

    it(
        'refuses a link that is not a GIF',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { gifFromURL } = _converse.exports.isacloud_stickers;
            const fetch_mock = vi.spyOn(window, 'fetch');

            fetch_mock.mockResolvedValueOnce(new Response(await makePNG(), { status: 200 }));
            expect((await failure(gifFromURL('https://example.org/cat.png'))).code).toBe('not-gif');

            fetch_mock.mockResolvedValueOnce(new Response('<!doctype html><html></html>', { status: 200 }));
            expect((await failure(gifFromURL('https://example.org/cat.gif'))).code).toBe('not-gif');

            fetch_mock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
            expect((await failure(gifFromURL('https://example.org/gone.gif'))).code).toBe('download');
        }),
    );

    it(
        'refuses a link that is not http(s)',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { gifFromURL } = _converse.exports.isacloud_stickers;
            const fetch_mock = vi.spyOn(window, 'fetch');
            for (const url of ['ftp://example.org/cat.gif', 'data:image/gif;base64,R0lGOD', 'cat.gif', '']) {
                expect((await failure(gifFromURL(url))).code).toBe('invalid-url');
            }
            expect(fetch_mock).not.toHaveBeenCalled();
        }),
    );

    it(
        'refuses a GIF larger than the maximum, from its length or while reading it',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { gifFromURL, MAX_STICKER_BYTES } = _converse.exports.isacloud_stickers;
            const fetch_mock = vi.spyOn(window, 'fetch');

            // Announced by the response, so the body is not read at all.
            fetch_mock.mockResolvedValueOnce(
                new Response(gifBlob(), {
                    status: 200,
                    headers: { 'content-length': String(MAX_STICKER_BYTES + 1) },
                }),
            );
            expect((await failure(gifFromURL('https://example.org/huge.gif'))).code).toBe('too-large');

            // No length: the body is read in chunks and refused once it is too big.
            let sent = 0;
            const chunk = new Uint8Array(1024 * 1024);
            const body = new ReadableStream({
                pull(controller) {
                    if (sent > MAX_STICKER_BYTES) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(chunk);
                    sent += chunk.byteLength;
                },
            });
            fetch_mock.mockResolvedValueOnce(new Response(body, { status: 200 }));
            expect((await failure(gifFromURL('https://example.org/stream.gif'))).code).toBe('too-large');
        }),
    );

    it(
        'imports a GIF from a link, previews it, and goes back to the grid on Cancel',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const modal = await openPicker(_converse);
            vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(gifBlob(), { status: 200 }));

            modal.querySelector('.isacloud-stickers__import-button').click();
            await u.waitUntil(() => modal.view === 'import' && modal.querySelector('.isacloud-stickers__url'));
            expect(modal.getModalTitle()).toBe('Import sticker');

            const input = modal.querySelector('.isacloud-stickers__url-input');
            input.value = 'https://example.org/cat.gif';
            input.dispatchEvent(new Event('input'));
            modal.querySelector('.isacloud-stickers__url').requestSubmit();

            const img = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__preview img'));
            expect(img.getAttribute('src').startsWith('blob:')).toBe(true);
            expect(modal.querySelector('.isacloud-stickers__error')).toBeNull();

            modal.querySelector('.isacloud-stickers__import-cancel').click();
            await u.waitUntil(() => modal.view === 'grid' && modal.querySelector('.isacloud-stickers__empty'));
            expect(modal.querySelector('.isacloud-stickers__preview')).toBeNull();
            modal.close();
        }),
    );

    it(
        'previews a chosen GIF file, and refuses a PNG whatever its name says',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const modal = await openPicker(_converse);
            modal.querySelector('.isacloud-stickers__import-button').click();
            const input = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__file'));

            chooseFile(input, new File([GIF_BYTES], 'cat.gif', { type: 'image/gif' }));
            const img = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__preview img'));
            expect(img.getAttribute('src').startsWith('blob:')).toBe(true);

            // The input is reset, so the same file (or another) can be chosen again.
            chooseFile(input, new File([await makePNG()], 'cat.gif', { type: 'image/gif' }));
            const error = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__error'));
            expect(error.textContent).toContain('The file is not a GIF');
            expect(modal.querySelector('.isacloud-stickers__preview')).toBeNull();
            modal.close();
        }),
    );

    it(
        'takes a GIF picked with "+" to the import view instead of the editor',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            const modal = await openPicker(_converse);
            const input = modal.querySelector('.isacloud-stickers__image-file');
            chooseFile(input, new File([GIF_BYTES], 'cat.gif', { type: 'image/gif' }));

            await u.waitUntil(() => modal.view === 'import' && modal.querySelector('.isacloud-stickers__preview img'));
            expect(modal.querySelector('converse-isacloud-sticker-editor')).toBeNull();
            // A preview is not a sticker yet: nothing is stored before "Send as sticker".
            expect(await library.listStickers()).toEqual([]);
            modal.close();
        }),
    );
});

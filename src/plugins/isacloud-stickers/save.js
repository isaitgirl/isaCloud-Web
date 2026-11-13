/**
 * @description
 *  isaCloud: "Save sticker" on a received sticker (phase 2). The image is read
 *  back from the message's own `<img>` (an https URL, or a `blob:` URL when
 *  OMEMO decrypted it), normalised and stored in the library.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, log } from '@converse/headless';
import { toStickerPNG } from './image.js';
import { addSticker } from './library.js';
import { t } from './i18n.js';

/**
 * @param {HTMLElement} actions_el - The message actions element of a received sticker.
 * @returns {Promise<void>} Resolves once saved; rejects if it could not be.
 */
export async function saveStickerFromMessage(actions_el) {
    const img = /** @type {HTMLImageElement|null} */ (
        actions_el.closest('converse-chat-message')?.querySelector('img.chat-image')
    );
    if (!img?.src) throw new Error('The sticker image is not on the page');

    const response = await fetch(img.src);
    if (!response.ok) throw new Error(`The sticker could not be downloaded (HTTP ${response.status})`);

    const png = await toStickerPNG(await response.blob());
    const saved = await addSticker(png);
    if (!saved) throw new Error('The sticker could not be stored');

    api.toast.show('isacloud-sticker-saved', { type: 'success', body: t('Sticker saved') });
}

/**
 * Click handler of the "Save sticker" action.
 * @param {HTMLElement} actions_el
 */
export async function onSaveStickerClicked(actions_el) {
    try {
        await saveStickerFromMessage(actions_el);
    } catch (e) {
        log.error(e);
        api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not save the sticker') });
    }
}

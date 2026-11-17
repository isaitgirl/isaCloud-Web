/**
 * @description
 *  isaCloud: "Save sticker" on a received sticker (phase 2). The image is read
 *  back from the message (an https URL from the body or the out-of-band link,
 *  or the `blob:` URL OMEMO decrypted it into), then stored in the library.
 *  A GIF is kept byte for byte, so that it keeps animating; anything else is
 *  normalised to a 512 x 512 PNG.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, log } from '@converse/headless';
import { detectStickerFormat } from './format.js';
import { toStickerPNG } from './image.js';
import { addSticker } from './library.js';
import { t } from './i18n.js';

/**
 * @param {HTMLElement & { model?: any }} actions_el - The message actions element of a received sticker.
 * @returns {Promise<void>} Resolves once saved; rejects if it could not be.
 */
export async function saveStickerFromMessage(actions_el) {
    const model = actions_el.model;
    const img = /** @type {HTMLImageElement|null} */ (
        actions_el.closest('converse-chat-message')?.querySelector('img.chat-image')
    );
    // Under OMEMO the image was decrypted into a `blob:` URL, while the body holds
    // an `aesgcm://` link. Otherwise the message itself has the URL.
    const src = model?.get('is_encrypted') ? img?.src : model?.get('oob_url') || model?.get('body');
    if (!src) throw new Error('The sticker image is not on the page');

    const response = await fetch(src);
    if (!response.ok) throw new Error(`The sticker could not be downloaded (HTTP ${response.status})`);

    const blob = await response.blob();
    const gif = (await detectStickerFormat(blob)) === 'gif';
    const saved = gif ? await addSticker(blob, 'gif') : await addSticker(await toStickerPNG(blob), 'png');
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

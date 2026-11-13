/**
 * @description
 *  isaCloud: stickers (phases 1 to 3: receiving, sending, library, editor).
 *
 *  Protocol: the isaCloud iOS client sends a sticker as a normal HTTP Upload
 *  image message (XEP-0363, with the `jabber:x:oob` link in the body) plus an
 *  empty `<sticker xmlns='urn:xmpp:stickers:0'/>` child of the `<message>`.
 *  This is the XEP-0449 marker only, without Stickers File Sharing (XEP-0447):
 *  it is NOT compliant with XEP-0449, on purpose, to match the iOS client.
 *  With OMEMO the marker stays outside the encrypted payload, so it reveals
 *  that a sticker was sent (not which one). Accepted metadata leak.
 *
 *  Hooks used:
 *  - `parseMessage` (1:1 chats, carbons and MAM: the stanza is already unwrapped)
 *  - `parseMUCMessage` (groupchats; the stanza is the original, so the inner
 *    message of a MAM result is looked up in `utils.js`)
 *  - `getAttachmentMenuItems` (phase 2: the "Stickers" item, after the image
 *    item, only when HTTP Upload is supported; opens the picker in `sticker-modal.js`)
 *  - `afterFileUploaded` (phase 2: marks the upload of a sticker in `send.js`)
 *  - `createMessageStanza` (phase 2: adds the `<sticker/>` marker in `send.js`;
 *    it is registered after OMEMO's handler, so the marker sits outside the
 *    encrypted payload, as on iOS)
 *  - `getMessageActionButtons` (phase 2: "Save sticker" on received stickers, `save.js`)
 *  - `getToolbarButtons` (a shortcut button right after the paperclip, which
 *    opens the same picker as the attachment menu item)
 *
 *  The sticker icon (`icon.js`) is the plugin's own SVG symbol, added to the
 *  page next to Converse's icon sprite, used by the menu item and the button.
 *
 *  The message element has no hook for its CSS classes, so `index.js` wraps
 *  `getExtraMessageClasses()` on the `converse-chat-message` prototype to add
 *  `chat-msg--sticker`. This replaces a missing hook. The spec fails if
 *  upstream renames that method.
 *
 *  Strings are in pt-BR through `i18n.js`, without `.po` edits.
 *  Everything else of the plugin lives in this directory: `library.js` (the
 *  IndexedDB library), `image.js` (normalising to a 512 x 512 PNG, for received
 *  stickers), `render.js` and `editor.js` (the sticker editor of phase 3).
 *
 *  See isacloud-docs analysis 2026-11-13-figurinhas (in the private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, constants, converse, log } from '@converse/headless';
import { hasStickerMarker, getInnerMUCMessage } from './utils.js';
import { addStickerMarker, markUploadedSticker, sendSticker } from './send.js';
import { toStickerPNG } from './image.js';
import { clampOffset, drawSticker, exportSticker, layoutText, outlineColor, photoLimit } from './render.js';
import { addSticker, deleteSticker, listStickers, setFavorite, touchSticker } from './library.js';
import { onSaveStickerClicked } from './save.js';
import { openStickerPicker } from './sticker-modal.js';
import { t } from './i18n.js';
import { registerStickerIcon, STICKER_ICON } from './icon.js';
import { html } from 'lit';
import './styles/isacloud-stickers.scss';

const { Strophe } = converse.env;

/** Between the image item (200) and the location item (300) of the attachment menu. */
export const STICKER_ORDER = 250;

const WRAPPED = Symbol('isacloud-stickers-wrapped');

/**
 * Adds the `chat-msg--sticker` class to messages marked as stickers.
 * @returns {void}
 */
function wrapMessageClasses() {
    const MessageElement = customElements.get('converse-chat-message');
    const proto = MessageElement?.prototype;
    if (!proto || typeof proto.getExtraMessageClasses !== 'function') {
        log.warn(
            'isacloud-stickers: converse-chat-message.getExtraMessageClasses not found, stickers will not be styled',
        );
        return;
    }
    if (proto[WRAPPED]) return;

    const original = proto.getExtraMessageClasses;
    /** @this {any} */
    proto.getExtraMessageClasses = function () {
        const classes = original.call(this);
        return this.model?.get('isacloud_sticker') ? `${classes} chat-msg--sticker` : classes;
    };
    proto[WRAPPED] = true;
}

/**
 * Stickers are sent through HTTP Upload, so they are offered where it works,
 * as the image item is, and hidden with the file button.
 * @returns {Promise<boolean>}
 */
async function canSendStickers() {
    const buttons = api.settings.get('visible_toolbar_buttons') ?? {};
    if (buttons.fileupload === false) return false;
    return !!(await api.disco.supports(Strophe.NS.HTTPUPLOAD, _converse.session.get('domain')));
}

/**
 * `getToolbarButtons` handler: a stickers shortcut right after the paperclip.
 * @param {import('../../shared/chat/toolbar').ChatToolbar} toolbar_el
 * @param {Array<any>} buttons
 */
async function addStickerToolbarButton(toolbar_el, buttons) {
    if (!(await canSendStickers())) return buttons;
    const { model } = toolbar_el;
    const color = model.get('type') === constants.CHATROOMS_TYPE ? '--muc-color' : '--chat-color';
    const label = t('Stickers');
    const button = html`<button
        type="button"
        class="btn isacloud-stickers-button"
        title="${label}"
        aria-label="${label}"
        @click=${(/** @type {MouseEvent} */ ev) => {
            ev.preventDefault();
            openStickerPicker(model);
        }}
    >
        <converse-icon color="var(${color})" class="fa ${STICKER_ICON}" size="1em"></converse-icon>
    </button>`;
    const clip = buttons.findIndex((b) => b?.strings?.join('').includes('<converse-attachment-menu'));
    const result = [...buttons];
    result.splice(clip >= 0 ? clip + 1 : result.length, 0, button);
    return result;
}

/**
 * `getAttachmentMenuItems` handler: the "Stickers" item, listed only where
 * HTTP Upload works, as the image item is, and hidden with the file button.
 * @param {import('../../shared/chat/attachment-menu').default} menu
 * @param {import('../../shared/chat/types').AttachmentMenuItem[]} items
 */
async function getStickerMenuItem(menu, items) {
    if (!(await canSendStickers())) return items;
    items.push({
        name: 'stickers',
        order: STICKER_ORDER,
        icon: STICKER_ICON,
        label: t('Stickers'),
        handler: () => openStickerPicker(menu.model),
    });
    return items;
}

/**
 * `getMessageActionButtons` handler: "Save sticker" on a received sticker only.
 * @param {HTMLElement & { model: any }} el - The message actions element.
 * @param {Array<Object>} buttons
 */
function addSaveStickerButton(el, buttons) {
    if (!el.model?.get('isacloud_sticker') || el.model.get('sender') === 'me') return buttons;
    buttons.push({
        i18n_text: t('Save sticker'),
        handler: () => onSaveStickerClicked(el),
        button_class: 'chat-msg__action-save-sticker',
        icon_class: 'fas fa-save',
        name: 'save-sticker',
    });
    return buttons;
}

converse.plugins.add('converse-isacloud-stickers', {
    dependencies: ['converse-chatview', 'converse-muc-views'],

    initialize() {
        api.listen.on('parseMessage', (stanza, attrs) => {
            if (!hasStickerMarker(stanza)) return attrs;
            return { ...attrs, isacloud_sticker: true };
        });

        api.listen.on('parseMUCMessage', (stanza, attrs) => {
            if (!hasStickerMarker(getInnerMUCMessage(stanza))) return attrs;
            return { ...attrs, isacloud_sticker: true };
        });

        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_stickers = {
            sendSticker,
            toStickerPNG,
            drawSticker,
            exportSticker,
            layoutText,
            outlineColor,
            photoLimit,
            clampOffset,
            openStickerPicker,
            library: { addSticker, deleteSticker, listStickers, setFavorite, touchSticker },
        };

        api.listen.on('getAttachmentMenuItems', getStickerMenuItem);
        api.listen.on('getToolbarButtons', addStickerToolbarButton);
        api.listen.on('createMessageStanza', addStickerMarker);
        api.listen.on('afterFileUploaded', markUploadedSticker);
        api.listen.on('getMessageActionButtons', addSaveStickerButton);

        // The element is only registered when converse.initialize() runs, after plugins
        // have been initialized, so wait for it.
        customElements.whenDefined('converse-chat-message').then(wrapMessageClasses);
        registerStickerIcon();
    },
});

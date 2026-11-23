/**
 * @description
 *  isaCloud: the tap on the reply card of a XEP-0461 reply takes the user to
 *  the original message.
 *
 *  `ReplyContext.scrollToRepliedMessage` (`src/shared/chat/reply-context.js`)
 *  only works when the original is already rendered. Two things break that:
 *  the original may not be held yet (MAM history), and the message list is
 *  virtualized (`WINDOW_SIZE = 100` in `src/shared/chat/chat-content.js`), so
 *  even a loaded original may have no element in the DOM.
 *
 *  This module wraps that method to load the missing history (with a ceiling
 *  per tap), move the window so the original is in the middle of the list and
 *  then scroll to and highlight it. When the original can't be shown, a short
 *  toast says so. The list is never hidden.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, log, u } from '@converse/headless';
import { isHiddenMessage } from 'shared/chat/utils.js';
import { t } from './i18n.js';

const WRAPPED = Symbol('isacloud-replies-jump');
const SEARCHING = Symbol('isacloud-replies-jump-searching');

/**
 * How many messages a tap may load from the archive before giving up. This is
 * the Web translation of the "too far" case of the contract: past it, the
 * original is treated as unavailable.
 */
export const MAX_LOADED_MESSAGES = 200;

const HIGHLIGHT_DURATION = 2000;
const SCROLL_TIMEOUT = 1500;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_WINDOW_SIZE = 100;
const TOAST_NAME = 'isacloud-reply-unavailable';

/**
 * Whether {@link installJump} has already wrapped the method. Also the guard
 * test for the wrap, so that an upstream rename doesn't silently lose the jump.
 * @returns {boolean}
 */
export function isJumpWrapped() {
    return !!(/** @type {any} */ (customElements.get('converse-reply-context')?.prototype)?.[WRAPPED]);
}

/**
 * The element of the message with `msgid` under `root`. The message template
 * puts the id in `data-msgid` on each `<article>`.
 * @param {ParentNode} root
 * @param {string} msgid
 * @returns {HTMLElement|undefined}
 */
function findMessageElement(root, msgid) {
    const elements = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('article[data-msgid]')));
    return elements.find((el) => el.dataset.msgid === msgid);
}

/**
 * Tells the user the original can't be shown right now.
 * @returns {void}
 */
function showUnavailable() {
    api.toast?.show(TOAST_NAME, { type: 'info', body: t('Original message unavailable') });
}

/**
 * Scrolls to an element and marks it for a moment. In a browser the list may
 * run its scroll handler afterwards; with the element centered it stays put.
 * @param {HTMLElement} el
 * @returns {void}
 */
function highlight(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('chat-msg--highlighted');
    setTimeout(() => el.classList.remove('chat-msg--highlighted'), HIGHLIGHT_DURATION);
}

/**
 * Loads archive history in rounds until the replied-to message is held. Each
 * round asks for everything held plus one page, which `api.archive.page` fills
 * from the archive (and from the gaps in the history it already has).
 * @param {any} chat
 * @param {string} reply_to_id
 * @returns {Promise<any>} The message, or `undefined` when it can't be reached.
 */
async function loadReferencedMessage(chat, reply_to_id) {
    if (typeof api.archive?.page !== 'function') return undefined;

    const page_size = Number(api.settings.get('archived_messages_page_size')) || DEFAULT_PAGE_SIZE;
    let loaded = 0;

    while (loaded < MAX_LOADED_MESSAGES) {
        const held = chat.messages.length;
        try {
            await api.archive.page(chat, { limit: held + page_size });
            await chat.msg_chain;
        } catch (e) {
            log.warn('isacloud-replies: could not load history to reach the replied-to message', e);
            return undefined;
        }

        const original = chat.getReferencedMessage(reply_to_id);
        if (original) return original;

        const grew = chat.messages.length - held;
        // Nothing new: the history is exhausted or the archive isn't available.
        if (grew <= 0) return undefined;
        loaded += grew;
    }
    return undefined;
}

/**
 * Moves the virtualized window so that `index` (in the drawn messages) sits in
 * the middle. `window_top` and `window_bottom` are reactive, so assigning them
 * re-renders the list.
 * @param {any} content - A `converse-chat-content` element.
 * @param {number} total - How many messages the list draws.
 * @param {number} index - Index of the message to center.
 * @returns {Promise<void>}
 */
async function centerWindow(content, total, index) {
    let size = content.window_bottom - content.window_top + 1;
    if (!(size > 0)) size = DEFAULT_WINDOW_SIZE;

    let top = Math.max(0, index - Math.floor(size / 2));
    const bottom = Math.min(total - 1, top + size - 1);
    top = Math.max(0, bottom - size + 1);

    content.window_top = top;
    content.window_bottom = bottom;
    await content.updateComplete;
}

/**
 * The wrapped `ReplyContext.scrollToRepliedMessage`.
 * @this {any} - A `converse-reply-context` element.
 * @param {MouseEvent} [ev]
 * @returns {Promise<void>}
 */
async function scrollToRepliedMessage(ev) {
    ev?.preventDefault?.();

    // A second tap while the first one is still searching shouldn't query the
    // archive again for the same card.
    if (this[SEARCHING]) return;
    this[SEARCHING] = true;

    try {
        const chat = this.model_with_messages ?? this.model?.collection?.chatbox;
        const reply_to_id = this.model?.get('reply_to_id');
        // The social app messages have no reply and no `getReferencedMessage`.
        if (!chat || !reply_to_id || typeof chat.getReferencedMessage !== 'function') return;

        // The card is only reachable while the message that carries it is drawn,
        // so this is the live chat view. Keep it: loading history may move the
        // window and take the card itself out of the DOM.
        const container = this.closest('converse-chat, converse-muc');
        const content = /** @type {any} */ (
            container?.querySelector('converse-chat-content, converse-muc-chat-content')
        );

        let original = chat.getReferencedMessage(reply_to_id);
        if (original?.isRetracted?.()) {
            showUnavailable();
            return;
        }

        if (!original) original = await loadReferencedMessage(chat, reply_to_id);

        if (!original || original.isRetracted?.()) {
            showUnavailable();
            return;
        }

        const root = container ?? /** @type {ParentNode} */ (this.getRootNode());

        if (!content) {
            // No virtualized list to move: keep the old, plain scroll.
            const el = findMessageElement(root, original.get('msgid'));
            if (el) highlight(el);
            return;
        }

        const drawn = chat.messages.filter((/** @type {any} */ m) => !isHiddenMessage(m));
        const index = drawn.indexOf(original);
        if (index < 0) {
            showUnavailable();
            return;
        }

        await centerWindow(content, drawn.length, index);

        const msgid = original.get('msgid');
        const el = await u.waitUntil(() => findMessageElement(content, msgid), SCROLL_TIMEOUT).catch(() => undefined);
        if (!el) {
            showUnavailable();
            return;
        }
        highlight(el);
    } finally {
        this[SEARCHING] = false;
    }
}

/**
 * Wraps `ReplyContext.prototype.scrollToRepliedMessage` so a tap can load,
 * recenter and scroll to the original. Wraps once; when the method is missing
 * it warns and leaves the tap with its current behavior.
 * @returns {void}
 */
export function installJump() {
    const proto = /** @type {any} */ (customElements.get('converse-reply-context')?.prototype);
    if (!proto) {
        log.warn('isacloud-replies: converse-reply-context not found, the reply jump is disabled');
        return;
    }
    if (proto[WRAPPED]) return;
    if (typeof proto.scrollToRepliedMessage !== 'function') {
        log.warn('isacloud-replies: ReplyContext.scrollToRepliedMessage not found, the reply jump is disabled');
        return;
    }

    proto.scrollToRepliedMessage = scrollToRepliedMessage;
    proto[WRAPPED] = true;
}

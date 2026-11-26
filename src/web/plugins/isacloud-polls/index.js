/**
 * @description
 *  isaCloud: Fluux polls (`urn:fluux:poll:0`), phases 1 to 3.
 *
 *  A poll is a groupchat message with a `<poll>` child and a textual `<body>`
 *  fallback; a vote is a XEP-0444 reaction on that message, and the creator
 *  closes it with a `<poll-closed>` message carrying the frozen tally. This
 *  plugin reads and displays the poll, votes by clicking an option, creates a
 *  poll from the attachment menu and closes it from the message actions.
 *
 *  Hooks used:
 *  - `parseMUCMessage` (reads `<poll>`/`<poll-closed>`, including MAM results);
 *  - `getAttachmentMenuItems` (the "Create poll" item, groupchats only);
 *  - `getMessageActionButtons` ("End poll", for the creator);
 *  - `createMessageStanza` (adds `<poll>`/`<poll-closed>`, the XEP-0428
 *    fallback and `<store/>` outside OMEMO, like `<sticker/>`);
 *  - `afterMessageCreated` (applies a received `<poll-closed>` to its original,
 *    or keeps it pending until the original arrives);
 *  - a wrap of `converse-chat-message.renderMessageText`, which has no hook, to
 *    put the card where the text would be (the same approach as
 *    `isacloud-update` and `isacloud-stickers`).
 *
 *  Votes are sent in the clear even in OMEMO rooms (see `poll-card.js`); the
 *  poll itself also travels outside the encryption. The option emojis are
 *  written to `hidden_reaction_emojis`, which the reactions view filters out,
 *  so a vote is shown by the card and not twice as a reaction chip.
 *
 *  Strings are in pt-BR through `i18n.js`, without `.po` edits. See
 *  isacloud-docs `analise-enquetes.md` (private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { _converse, api, constants, converse, log } from '@converse/headless';
import { parsePollMessage, parsePollElement, parsePollClosedElement, getInnerMUCMessage } from './parsers.js';
import { closedTallyTotal, computePollTally, getMyVotes, getOptionEmojis, isPollExpired } from './tally.js';
import { addPollStanza } from './send.js';
import { closePoll, computeClosedTally, isValidClose, onAfterMessageCreated } from './close.js';
import { t } from './i18n.js';
import './poll-card.js';
import './poll-modal.js';
import './styles/polls.scss';

const { CHATROOMS_TYPE } = constants;
const WRAPPED = Symbol('isacloud-polls-wrapped');

/**
 * `converse-chat-message.renderMessageText` has no hook. Wrapping it lets the
 * card take the place of the text (and hide the `<body>` fallback) in a
 * groupchat, while 1:1 messages keep the normal text.
 * @returns {void}
 */
function wrapMessageRender() {
    const MessageElement = customElements.get('converse-chat-message');
    const proto = MessageElement?.prototype;
    if (!proto || typeof proto.renderMessageText !== 'function') {
        log.warn('isacloud-polls: converse-chat-message.renderMessageText not found, poll cards will not be shown');
        return;
    }
    if (proto[WRAPPED]) return;

    const original = proto.renderMessageText;
    /** @this {any} */
    proto.renderMessageText = function (tpl_time) {
        const model = this.model;
        if (model?.get('type') === 'groupchat' && (model.get('isacloud_poll') || model.get('isacloud_poll_closed'))) {
            return html`<converse-isacloud-poll .model=${model}></converse-isacloud-poll>`;
        }
        return original.call(this, tpl_time);
    };
    proto[WRAPPED] = true;
}

/**
 * `getAttachmentMenuItems` handler: "Create poll" in a groupchat. The room must
 * exist and the user must be able to post; the modal does the rest.
 * @param {import('shared/chat/attachment-menu').default} menu
 * @param {import('shared/chat/types').AttachmentMenuItem[]} items
 */
function addPollMenuItem(menu, items) {
    const model = menu.model;
    if (model.get('type') !== CHATROOMS_TYPE) return items;
    if (typeof model.canPostMessages === 'function' && !model.canPostMessages()) return items;
    items.push({
        name: 'poll',
        order: 400,
        icon: 'fa-list-ul',
        label: t('Create poll'),
        handler: () => api.modal.show('converse-isacloud-poll-modal', { model }),
    });
    return items;
}

/**
 * `getMessageActionButtons` handler: "End poll" on our own open poll.
 * @param {HTMLElement & { model: any }} el
 * @param {Array<Object>} buttons
 */
function addClosePollButton(el, buttons) {
    const message = el.model;
    const poll = message?.get('isacloud_poll');
    if (!poll || message.get('isacloud_poll_closed_at')) return buttons;

    const chatbox = message.collection?.chatbox;
    if (!chatbox || chatbox.get('type') !== CHATROOMS_TYPE) return buttons;
    if (message.get('sender') !== 'me' || isPollExpired(poll)) return buttons;

    buttons.push({
        'i18n_text': t('End poll'),
        'handler': () => closePoll(chatbox, message),
        'button_class': 'chat-msg__action-close-poll',
        'icon_class': 'fas fa-check',
        'name': 'close-poll',
    });
    return buttons;
}

converse.plugins.add('converse-isacloud-polls', {
    dependencies: ['converse-chatview', 'converse-muc-views', 'converse-reactions', 'converse-modal'],

    initialize() {
        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_polls = {
            parsePollMessage,
            parsePollElement,
            parsePollClosedElement,
            getInnerMUCMessage,
            computePollTally,
            closedTallyTotal,
            getMyVotes,
            getOptionEmojis,
            isPollExpired,
            computeClosedTally,
            isValidClose,
            onAfterMessageCreated,
        };

        api.listen.on('parseMUCMessage', parsePollMessage);
        api.listen.on('getAttachmentMenuItems', addPollMenuItem);
        api.listen.on('getMessageActionButtons', addClosePollButton);
        api.listen.on('createMessageStanza', addPollStanza);
        api.listen.on('afterMessageCreated', onAfterMessageCreated);

        // The element is only registered when converse.initialize() runs, after
        // plugins have been initialized, so wait for it.
        customElements.whenDefined('converse-chat-message').then(wrapMessageRender);
    },
});

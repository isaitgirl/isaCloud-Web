/**
 * @description
 *  isaCloud: closing a Fluux poll (`urn:fluux:poll:0`).
 *
 *  Only the creator closes it, with a new groupchat message carrying the frozen
 *  tally. The poll is marked closed **before** the closing message is sent, so
 *  a crash in the middle of the send cannot reopen it; a failed send restores
 *  the previous state. The original keeps both `isacloud_poll_closed` (the
 *  frozen tally) and `isacloud_poll_closed_at`, so its card shows the result
 *  even when the reactions were pruned, and every copy of the poll message in
 *  the collection is marked.
 *
 *  A received `<poll-closed>` is verified before it marks the original: the
 *  sender must be the creator, the title must match and every tally emoji must
 *  belong to the poll's options. A valid closing is consumed: it is applied to
 *  the original and removed from the collection, so it does not become a second
 *  card. A repeated closing is ignored the same way. Only a closing whose
 *  original is missing stays as a card, which is the result for someone who
 *  joined after the poll.
 *
 *  If the closing message arrives before the original (for example, a MAM page
 *  that does not include it yet), it is kept pending and applied when the
 *  original is created; the pending closing message is then removed.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, converse } from '@converse/headless';
import { alertSendError } from 'shared/chat/send-errors.js';
import { computePollTally } from './tally.js';
import { buildClosedBody } from './send.js';
import { t } from './i18n.js';

const { Strophe } = converse.env;

/**
 * @typedef {object} PendingClose
 * @property {any} closed
 * @property {{from?: string, occupant_id?: string}} closer
 * @property {string} [time]
 * @property {any} message - The closing message, removed once the original adopts it.
 */

/** Closing messages whose original was not in the collection yet. */
/** @type {Map<string, PendingClose>} */
const pending_closes = new Map();

/**
 * The nick of a reactor key, or null when it is not known. A full JID
 * (`room@server/nick`) carries the nick; an `occupant_id` is looked up in the
 * room. A bare JID is not a nick, and the protocol says to omit it rather than
 * send a JID in `voters`.
 * @param {string} key
 * @param {import('@converse/headless').MUC} chatbox
 * @returns {string|null}
 */
function reactorNick(key, chatbox) {
    if (!key) return null;
    if (key.includes('/')) return key.split('/').pop() || null;
    const occupant = chatbox?.occupants?.get(key);
    return occupant?.get('nick') || null;
}

/**
 * The frozen tally of a poll: the same counts as the card, with the voters'
 * nicks for the `<tally voters="…">` attribute.
 * @param {import('./tally').Poll} poll
 * @param {import('./tally').Reactions} reactions
 * @param {import('@converse/headless').MUC} chatbox
 * @returns {{emoji: string, label: string, count: number, voters: string[]}[]}
 */
export function computeClosedTally(poll, reactions, chatbox) {
    const { options } = computePollTally(poll, reactions);
    return options.map((option) => ({
        emoji: option.emoji,
        label: option.label,
        count: option.count,
        // A nick can repeat when a legacy client voted for several options.
        voters: [...new Set(option.voters.map((key) => reactorNick(key, chatbox)).filter(Boolean))],
    }));
}

/**
 * @param {any} original
 * @param {{from?: string, occupant_id?: string}} closer
 * @returns {boolean}
 */
function isCreator(original, closer) {
    const original_id = original.get('occupant_id');
    if (original_id && closer.occupant_id) return original_id === closer.occupant_id;
    const original_nick = Strophe.getResourceFromJid(original.get('from'));
    const closer_nick = Strophe.getResourceFromJid(closer.from);
    return !!original_nick && original_nick === closer_nick;
}

/**
 * The XEP-POLL verification of a closing message against the original.
 * @param {any} original
 * @param {{from?: string, occupant_id?: string}} closer
 * @param {any} closed
 * @returns {boolean}
 */
export function isValidClose(original, closer, closed) {
    const poll = original.get('isacloud_poll');
    if (!poll) return false;
    if (!closed.title || closed.title !== poll.title) return false;
    const option_emojis = new Set(poll.options.map((option) => option.emoji));
    if (!closed.tally.every((entry) => option_emojis.has(entry.emoji))) return false;
    return isCreator(original, closer);
}

/**
 * Every id by which a poll message can be referred to: the client id the plugin
 * kept from the stanza, our own `msgid`, and an `<origin-id>` when the sender
 * included one.
 * @param {any} message
 * @returns {string[]}
 */
function messageIDs(message) {
    return [message.get('isacloud_poll_client_id'), message.get('msgid'), message.get('origin_id')].filter(Boolean);
}

/**
 * @param {any} chatbox
 * @param {string} message_id
 * @returns {any|undefined}
 */
function findOriginal(chatbox, message_id) {
    return chatbox.messages.find((message) => messageIDs(message).includes(message_id));
}

/**
 * The poll message and every copy of it in the collection: our own sent copy
 * and a MAM replay can differ in `msgid`, but share the client id or an
 * `<origin-id>`.
 * @param {any} chatbox
 * @param {any} message
 * @returns {any[]}
 */
function pollCopies(chatbox, message) {
    const ids = new Set(messageIDs(message));
    if (!ids.size || !chatbox.messages) return [message];
    const copies = chatbox.messages.filter((other) => other === message || messageIDs(other).some((id) => ids.has(id)));
    // The message is in the collection when this runs, but keep it in the list
    // if it ever isn't, so it still gets marked.
    if (!copies.includes(message)) copies.push(message);
    return copies;
}

/**
 * Marks a poll message closed, freezing the tally on it. Both attributes are
 * needed: the tally for the card and the instant for hiding "End poll".
 * @param {any} message
 * @param {string|null} time
 * @param {any} closed
 * @returns {void}
 */
function markClosed(message, time, closed) {
    message.save({
        isacloud_poll_closed: closed,
        isacloud_poll_closed_at: time || new Date().toISOString(),
    });
}

/**
 * Puts back what a poll message had before a failed send marked it closed.
 * @param {{message: any, closed: any, closed_at: any}[]} previous
 * @returns {void}
 */
function restoreClosed(previous) {
    for (const { message, closed, closed_at } of previous) {
        message.save({ isacloud_poll_closed: closed, isacloud_poll_closed_at: closed_at });
    }
}

/**
 * Removes a consumed closing message from the collection, so that only the
 * original card remains. `destroy` also drops it from the storage.
 * @param {any} chatbox
 * @param {any} message
 * @returns {void}
 */
function discardClosingMessage(chatbox, message) {
    if (message?.collection === chatbox.messages) message.destroy();
}

/**
 * The "End poll" action: confirms, freezes the tally on the original (and on
 * every copy of it) and sends the `<poll-closed>` message. Marking before the
 * send means a crash in the middle of it cannot reopen the poll; a rejected
 * send restores the previous state.
 * @param {import('@converse/headless').MUC} chatbox
 * @param {any} message - The poll message.
 * @returns {Promise<void>}
 */
export async function closePoll(chatbox, message) {
    const poll = message.get('isacloud_poll');
    if (!poll) return;

    const confirmed = await api.confirm(t('End poll?'), [t('The result is frozen and the poll cannot be reopened.')]);
    if (!confirmed) return;

    const tally = computeClosedTally(poll, message.get('reactions'), chatbox);
    const closed = {
        message_id: message.get('isacloud_poll_client_id') || message.get('msgid') || message.get('origin_id'),
        title: poll.title,
        description: poll.description,
        tally,
    };
    if (!closed.message_id) return;

    const closed_at = new Date().toISOString();
    const previous = pollCopies(chatbox, message).map((copy) => {
        const before = {
            message: copy,
            closed: copy.get('isacloud_poll_closed'),
            closed_at: copy.get('isacloud_poll_closed_at'),
        };
        markClosed(copy, closed_at, closed);
        return before;
    });

    let sent;
    try {
        sent = await chatbox.sendMessage({
            body: buildClosedBody(closed),
            isacloud_poll_closed: closed,
            hidden_reaction_emojis: tally.map((entry) => entry.emoji),
        });
    } catch (e) {
        restoreClosed(previous);
        alertSendError(/** @type {Error} */ (e));
        return;
    }

    // `sendMessage` returns nothing when the room cannot accept the message.
    if (!sent) {
        restoreClosed(previous);
        return;
    }

    // The closing message is the official result of the original card and must
    // not be a card of its own.
    if (sent?.get('isacloud_poll_closed') && !sent.get('isacloud_poll')) discardClosingMessage(chatbox, sent);
}

/**
 * `afterMessageCreated` handler: applies a closing message to its original, or
 * remembers it until the original arrives. Runs for both live messages and
 * MAM results. A valid closing is consumed, so it does not become a second
 * card; a repeated closing is ignored the same way.
 * @param {any} chatbox
 * @param {any} message
 * @returns {any} The message, for the next listener in the hook chain.
 */
export function onAfterMessageCreated(chatbox, message) {
    const closed = message.get('isacloud_poll_closed');
    if (closed?.message_id) {
        const original = findOriginal(chatbox, closed.message_id);
        const closer = { from: message.get('from'), occupant_id: message.get('occupant_id') };
        if (original) {
            if (isValidClose(original, closer, closed)) {
                // The first valid closing wins; a repeated one is only consumed.
                if (!original.get('isacloud_poll_closed_at')) markClosed(original, message.get('time'), closed);
                discardClosingMessage(chatbox, message);
            }
        } else {
            pending_closes.set(closed.message_id, { closed, closer, time: message.get('time'), message });
        }
        return message;
    }

    const poll = message.get('isacloud_poll');
    const poll_ids = messageIDs(message);
    if (poll && poll_ids.length) {
        const pending = poll_ids.map((id) => pending_closes.get(id)).find(Boolean);
        if (pending) {
            if (isValidClose(message, pending.closer, pending.closed)) {
                if (!message.get('isacloud_poll_closed_at')) markClosed(message, pending.time, pending.closed);
                discardClosingMessage(chatbox, pending.message);
            }
            for (const id of poll_ids) pending_closes.delete(id);
        }
    }
    return message;
}

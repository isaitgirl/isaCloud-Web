/**
 * @description
 *  isaCloud: closing a Fluux poll (`urn:fluux:poll:0`).
 *
 *  Only the creator closes it, with a new groupchat message carrying the frozen
 *  tally. The closing message is the official result; the original message gets
 *  `isacloud_poll_closed_at` so its card stops accepting votes and shows
 *  "closed". A received `<poll-closed>` is verified before it marks the
 *  original: the sender must be the creator, the title must match and every
 *  tally emoji must belong to the poll's options.
 *
 *  If the closing message arrives before the original (for example, a MAM page
 *  that does not include it yet), it is kept pending and applied when the
 *  original is created.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, converse } from '@converse/headless';
import { alertSendError } from 'shared/chat/send-errors.js';
import { computePollTally } from './tally.js';
import { buildClosedBody } from './send.js';
import { t } from './i18n.js';

const { Strophe } = converse.env;

/** Closing messages whose original was not in the collection yet. */
/** @type {Map<string, {closed: any, closer: {from?: string, occupant_id?: string}, time?: string}>} */
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
 * @param {any} original
 * @param {string} [time]
 */
function markClosed(original, time) {
    original.save({ isacloud_poll_closed_at: time || new Date().toISOString() });
}

/**
 * The "End poll" action: confirms, sends the `<poll-closed>` message and marks
 * the original. The tally and the voters are computed here, before sending.
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

    try {
        await chatbox.sendMessage({
            body: buildClosedBody(closed),
            isacloud_poll_closed: closed,
            hidden_reaction_emojis: tally.map((entry) => entry.emoji),
        });
        markClosed(message);
    } catch (e) {
        alertSendError(/** @type {Error} */ (e));
    }
}

/**
 * `afterMessageCreated` handler: applies a closing message to its original, or
 * remembers it until the original arrives. Runs for both live messages and
 * MAM results.
 * @param {any} chatbox
 * @param {any} message
 * @returns {void}
 */
export function onAfterMessageCreated(chatbox, message) {
    const closed = message.get('isacloud_poll_closed');
    if (closed?.message_id) {
        const original = findOriginal(chatbox, closed.message_id);
        const closer = { from: message.get('from'), occupant_id: message.get('occupant_id') };
        if (original) {
            if (isValidClose(original, closer, closed)) markClosed(original, message.get('time'));
        } else {
            pending_closes.set(closed.message_id, { closed, closer, time: message.get('time') });
        }
        return;
    }

    const poll = message.get('isacloud_poll');
    const poll_ids = messageIDs(message);
    if (poll && poll_ids.length) {
        const pending = poll_ids.map((id) => pending_closes.get(id)).find(Boolean);
        if (pending) {
            if (isValidClose(message, pending.closer, pending.closed)) markClosed(message, pending.time);
            for (const id of poll_ids) pending_closes.delete(id);
        }
    }
}

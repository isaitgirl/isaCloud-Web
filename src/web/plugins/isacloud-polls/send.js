/**
 * @description
 *  isaCloud: sending Fluux polls (`urn:fluux:poll:0`) and their stanzas.
 *
 *  The poll is a groupchat message: the creator sends the question and options
 *  in a `<poll>` element, plus a plain-text `<body>` for clients that don't
 *  know the extension. The body is the message body, so under OMEMO it goes
 *  encrypted while `<poll>`, the XEP-0428 `<fallback>` and the XEP-0334
 *  `<store/>` hint stay on the outer stanza (like `<sticker/>`).
 *
 *  A poll is closed with a separate `<poll-closed>` message carrying the frozen
 *  tally; see `close.js`.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';
import { alertSendError } from 'shared/chat/send-errors.js';
import { NS_POLL } from './parsers.js';

const { Stanza, Strophe, stx } = converse.env;

/** The option emojis the creation dialog offers, in order. */
export const OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

/** The maximum number of options the dialog creates. */
export const MAX_OPTIONS = OPTION_EMOJIS.length;

/**
 * The textual fallback of a poll, as Fluux builds it: the heading, an optional
 * description and one `<emoji> <label>` line per option.
 * @param {import('./tally').Poll} poll
 * @returns {string}
 */
export function buildPollBody(poll) {
    const lines = [`📊 Poll: ${poll.title}`];
    if (poll.description) lines.push(poll.description);
    for (const option of poll.options) lines.push(`${option.emoji} ${option.label}`);
    return lines.join('\n');
}

/**
 * The textual fallback of a closing message, in pt-BR like the native apps.
 * @param {{title?: string, description?: string, tally: {emoji: string, label: string, count: number}[]}} closed
 * @returns {string}
 */
export function buildClosedBody(closed) {
    const lines = [`📊 Poll encerrada: ${closed.title ?? ''}`];
    if (closed.description) lines.push(closed.description);
    for (const entry of closed.tally) lines.push(`${entry.emoji} ${entry.label}: ${entry.count}`);
    return lines.join('\n');
}

/**
 * Sends a poll in the room. The stanza hook adds `<poll>`, `<fallback>` and
 * `<store/>`; the body is the fallback that goes through the normal (possibly
 * encrypted) message path.
 * @param {import('@converse/headless').MUC} chatbox
 * @param {import('./tally').Poll} poll
 * @returns {Promise<void>}
 */
export async function createPoll(chatbox, poll) {
    try {
        await chatbox.sendMessage({
            body: buildPollBody(poll),
            isacloud_poll: poll,
            hidden_reaction_emojis: poll.options.map((option) => option.emoji),
        });
    } catch (e) {
        alertSendError(/** @type {Error} */ (e));
    }
}

/**
 * @param {import('./tally').Poll} poll
 * @returns {import('strophe.js').Builder}
 */
export function pollToElement(poll) {
    const attributes = [
        poll.allow_multiple ? 'allow-multiple="true"' : '',
        poll.hide_results ? 'hide-results="true"' : '',
        poll.deadline ? `deadline="${Strophe.xmlescape(poll.deadline)}"` : '',
    ]
        .filter(Boolean)
        .join(' ');
    return stx`<poll xmlns="${NS_POLL}" ${Stanza.unsafeXML(attributes)}>
        <title>${poll.title}</title>
        ${poll.description ? stx`<description>${poll.description}</description>` : ''}
        ${poll.options.map((option) => stx`<option emoji="${option.emoji}">${option.label}</option>`)}
    </poll>`;
}

/**
 * @param {{message_id: string, title?: string, description?: string, tally: {emoji: string, label: string, count: number, voters: string[]}[]}} closed
 * @returns {import('strophe.js').Builder}
 */
export function closedToElement(closed) {
    return stx`<poll-closed xmlns="${NS_POLL}" message-id="${closed.message_id}">
        ${closed.title ? stx`<title>${closed.title}</title>` : ''}
        ${closed.description ? stx`<description>${closed.description}</description>` : ''}
        ${closed.tally.map(
            (entry) => stx`<tally
                emoji="${entry.emoji}"
                label="${entry.label}"
                count="${entry.count}"
                ${entry.voters?.length ? Stanza.unsafeXML(`voters="${Strophe.xmlescape(entry.voters.join(','))}"`) : ''}
            />`,
        )}
    </poll-closed>`;
}

/**
 * `createMessageStanza` handler: adds the poll (or the closing) element, the
 * XEP-0428 fallback marker and the `<store/>` hint to the outgoing stanza. It
 * is registered after OMEMO's handler, so the elements stay outside the
 * encrypted payload.
 * @param {any} _chat
 * @param {{ message: any, stanza: import('strophe.js').Builder }} data
 * @returns {{ message: any, stanza: import('strophe.js').Builder }}
 */
export function addPollStanza(_chat, data) {
    const { message, stanza } = data;
    const poll = message.get('isacloud_poll');
    const closed = message.get('isacloud_poll_closed');
    if (!poll && !closed) return data;

    stanza.cnode(poll ? pollToElement(poll) : closedToElement(closed));
    stanza.cnode(stx`<fallback xmlns="${Strophe.NS.FALLBACK}" for="${NS_POLL}"><body/></fallback>`);
    stanza.cnode(stx`<store xmlns="${Strophe.NS.HINTS}"/>`);
    return data;
}

/**
 * @description
 *  isaCloud: parsing of Fluux polls (`urn:fluux:poll:0`) in groupchat messages.
 *
 *  A poll is a groupchat message with a `<poll>` child (title, description,
 *  options) and a textual `<body>` fallback. The creator closes it with a
 *  second message carrying `<poll-closed message-id="…">` and the frozen tally.
 *  In MAM results the real message is inside the `<result><forwarded>` wrapper,
 *  so it is unwrapped first, like the stickers plugin does.
 *
 *  Only groupchat is parsed. In a 1:1 chat the `<body>` is shown as an ordinary
 *  message, which is also what Fluux and the native apps do.
 *
 *  Everything is validated before it becomes a message attribute: an empty
 *  title, fewer than two usable options, or a closing without a `message-id`
 *  leaves the message as a normal text message.
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';

const { Strophe, sizzle } = converse.env;

/** The Fluux poll namespace. */
export const NS_POLL = 'urn:fluux:poll:0';

/**
 * @typedef {object} PollClosed
 * @property {string} message_id
 * @property {string} [title]
 * @property {string} [description]
 * @property {{emoji: string, label: string, count: number, voters: string[]}[]} tally
 */

/**
 * The message attributes this plugin adds.
 * @typedef {import('@converse/headless').MUCMessageAttributes & {
 *   isacloud_poll?: import('./tally').Poll,
 *   isacloud_poll_client_id?: string,
 *   isacloud_poll_closed?: PollClosed,
 *   hidden_reaction_emojis?: string[],
 * }} PollMessageAttributes
 */

/**
 * @param {Element} el
 * @param {string} name
 * @param {string} [ns]
 * @returns {Element|null} The direct child, or null.
 */
function getDirectChild(el, name, ns = NS_POLL) {
    for (const child of Array.from(el?.children ?? [])) {
        if (child.localName === name && (ns === null || child.namespaceURI === ns)) return child;
    }
    return null;
}

/**
 * @param {Element} el
 * @param {string} name
 * @param {string} [ns]
 * @returns {Element[]}
 */
function getDirectChildren(el, name, ns = NS_POLL) {
    return Array.from(el?.children ?? []).filter(
        (child) => child.localName === name && (ns === null || child.namespaceURI === ns),
    );
}

/**
 * The real message inside a MAM result, or the stanza itself.
 * @param {Element} stanza
 * @returns {Element}
 */
export function getInnerMUCMessage(stanza) {
    const forwarded = sizzle(
        `result[xmlns="${Strophe.NS.MAM}"] > forwarded[xmlns="${Strophe.NS.FORWARD}"] > message`,
        stanza,
    ).pop();
    return forwarded || stanza;
}

/**
 * @param {Element} el
 * @returns {string}
 */
function getText(el) {
    return (el?.textContent ?? '').trim();
}

/**
 * Reads a `<poll>` element. Options without an emoji or a label are dropped,
 * as in the native apps; two usable options are the minimum.
 * @param {Element} message - The message element, not the MAM wrapper.
 * @returns {import('./tally').Poll|null}
 */
export function parsePollElement(message) {
    const el = getDirectChild(message, 'poll');
    if (!el) return null;

    const title = getText(getDirectChild(el, 'title'));
    if (!title) return null;

    const options = getDirectChildren(el, 'option')
        .map((option) => ({
            emoji: (option.getAttribute('emoji') ?? '').trim(),
            label: getText(option),
        }))
        .filter((option) => option.emoji && option.label);
    if (options.length < 2) return null;

    const deadline_raw = el.getAttribute('deadline');
    const deadline_ms = deadline_raw ? Date.parse(deadline_raw) : NaN;

    return {
        title,
        description: getText(getDirectChild(el, 'description')) || undefined,
        allow_multiple: el.getAttribute('allow-multiple') === 'true',
        hide_results: el.getAttribute('hide-results') === 'true',
        deadline: Number.isFinite(deadline_ms) ? new Date(deadline_ms).toISOString() : undefined,
        options,
    };
}

/**
 * Reads a `<poll-closed>` element. `count` is clamped to a non-negative
 * integer; `voters` is a comma-separated list of nicks.
 * @param {Element} message - The message element, not the MAM wrapper.
 * @returns {PollClosed|null}
 */
export function parsePollClosedElement(message) {
    const el = getDirectChild(message, 'poll-closed');
    if (!el) return null;

    const message_id = (el.getAttribute('message-id') ?? '').trim();
    if (!message_id) return null;

    const tally = getDirectChildren(el, 'tally')
        .map((entry) => {
            const emoji = (entry.getAttribute('emoji') ?? '').trim();
            if (!emoji) return null;
            const count = Number.parseInt(entry.getAttribute('count') ?? '0', 10);
            return {
                emoji,
                label: (entry.getAttribute('label') ?? '').trim(),
                count: Number.isFinite(count) && count > 0 ? count : 0,
                voters: (entry.getAttribute('voters') ?? '')
                    .split(',')
                    .map((voter) => voter.trim())
                    .filter(Boolean),
            };
        })
        .filter(Boolean);
    if (!tally.length) return null;

    return {
        message_id,
        title: getText(getDirectChild(el, 'title')) || undefined,
        description: getText(getDirectChild(el, 'description')) || undefined,
        tally,
    };
}

/**
 * `parseMUCMessage` handler: turns a `<poll>`/`<poll-closed>` into message
 * attributes. `hidden_reaction_emojis` keeps the option emojis out of the
 * normal reaction row, since the card already shows them.
 * @param {Element} stanza
 * @param {import('@converse/headless').MUCMessageAttributes} attrs
 * @returns {PollMessageAttributes}
 */
export function parsePollMessage(stanza, attrs) {
    if (attrs.type !== 'groupchat') return attrs;
    const message = getInnerMUCMessage(stanza);

    const poll = parsePollElement(message);
    if (poll) {
        return {
            ...attrs,
            isacloud_poll: poll,
            // The stanza's client id, which `<poll-closed message-id>` refers
            // to. The MUC parser does not keep it as `msgid` for messages from
            // other clients, so the plugin stores it here.
            isacloud_poll_client_id: message.getAttribute('id') || undefined,
            hidden_reaction_emojis: [...new Set(poll.options.map((option) => option.emoji))],
        };
    }

    const closed = parsePollClosedElement(message);
    if (closed) {
        return {
            ...attrs,
            isacloud_poll_closed: closed,
            hidden_reaction_emojis: [...new Set(closed.tally.map((entry) => entry.emoji))],
        };
    }

    return attrs;
}

/**
 * @description
 *  isaCloud: reading replies, both the structured XEP-0461 `<reply>` (parsed
 *  by the core) and the older `<isacloud-quote>` marker that isaCloud Android
 *  sends. The `<reply>` always wins when both are present.
 *
 *  Old Android messages carry no `<fallback>`, so without one the message would
 *  show both the reply card and the `>` quote in its body. A fallback range is
 *  synthesized from the body with the same rule as the iOS app (guide §4).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';
import { getDirectChild, getInnerMUCMessage, NS_ISACLOUD_QUOTE } from './utils.js';

const { Strophe } = converse.env;

/**
 * Computes the XEP-0461 fallback range of a body that starts with a XEP-0393
 * `>` quote. The quoted block is the leading run of lines that start with `>`,
 * plus the newline that separates it from the reply text, counted in Unicode
 * code points (XEP-0426), with `start` at 0 and `end` exclusive.
 *
 * There is no fallback when the body does not start with `>`, or when nothing
 * other than whitespace follows the quote: in both cases there is no reply
 * text left to keep.
 *
 * @param {string} [body] - The body as parsed, already trimmed by the parsers.
 * @returns {{start: number, end: number}|undefined}
 */
export function synthesizeQuoteFallback(body) {
    if (!body || !body.startsWith('>')) return undefined;

    const lines = body.split('\n');
    let quoted_line_count = 0;
    while (quoted_line_count < lines.length && lines[quoted_line_count].startsWith('>')) quoted_line_count++;

    const rest = lines.slice(quoted_line_count).join('\n');
    if (!rest.trim()) return undefined;

    const quote = lines.slice(0, quoted_line_count).join('\n') + '\n';
    return { start: 0, end: [...quote].length };
}

/**
 * Adds `reply_to_id` (and, when possible, a synthesized fallback) from an
 * `<isacloud-quote>` marker, unless the message already replies with `<reply>`.
 * @param {Object} attrs
 * @param {string} id
 * @returns {Object}
 */
function withIsacloudQuote(attrs, id) {
    const fallback = attrs.fallback ?? {};
    // A reply fallback without a usable range is worth no more than none here.
    if (fallback[Strophe.NS.REPLY]) return { ...attrs, reply_to_id: id };

    // Under legacy OMEMO the quote is in the decrypted text (`plaintext`), not in
    // the cleartext body, which is absent: the marker travels outside the
    // encryption but the body does not.
    const range = synthesizeQuoteFallback(attrs.body ?? attrs.plaintext);
    if (!range) return { ...attrs, reply_to_id: id };
    return { ...attrs, reply_to_id: id, fallback: { ...fallback, [Strophe.NS.REPLY]: range } };
}

/**
 * `parseMessage` handler: reads the `<isacloud-quote>` of a 1:1 message,
 * carbon or MAM result (the stanza is already unwrapped there).
 * @param {Element} stanza
 * @param {Object} attrs
 * @returns {Object}
 */
export function addIsacloudQuote(stanza, attrs) {
    if (attrs.reply_to_id) return attrs;
    const quote = getDirectChild(stanza, 'isacloud-quote', NS_ISACLOUD_QUOTE);
    const id = quote?.getAttribute('id');
    if (!id) return attrs;
    return withIsacloudQuote(attrs, id);
}

/**
 * `parseMUCMessage` handler: same as {@link addIsacloudQuote}, for a groupchat
 * stanza that may still be wrapped in a MAM result.
 * @param {Element} stanza
 * @param {Object} attrs
 * @returns {Object}
 */
export function addIsacloudQuoteToMUC(stanza, attrs) {
    if (attrs.reply_to_id) return attrs;
    const quote = getDirectChild(getInnerMUCMessage(stanza), 'isacloud-quote', NS_ISACLOUD_QUOTE);
    const id = quote?.getAttribute('id');
    if (!id) return attrs;
    return withIsacloudQuote(attrs, id);
}

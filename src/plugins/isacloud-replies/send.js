/**
 * @description
 *  isaCloud: sending side of XEP-0461 replies.
 *
 *  The core of Converse puts `<reply>`/`<fallback>` only in the cleartext
 *  stanza, and the OMEMO plugin puts them inside the SCE `<content>` when it
 *  speaks omemo:2. The isaCloud apps only speak the legacy OMEMO payload, which
 *  is a bare string, so a reply from the Web to them lost its reference. This
 *  module adds the reply and its fallback as direct children of `<message>`,
 *  next to the legacy `<encrypted>`, exactly once.
 *
 *  It also sends the `<isacloud-quote>` marker when the original is a photo,
 *  GIF or sticker, so that apps which don't yet read `<reply>` keep showing the
 *  thumbnail. It is sent outside the encryption, and only when an old client
 *  can read it.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';
import { hasDirectChild, NS_ISACLOUD_QUOTE } from './utils.js';

const { Strophe, stx } = converse.env;

/**
 * Keep sending `<isacloud-quote>` while any of the three apps still reads only
 * that marker. Turn it off once iOS, Android and Web all read `<reply>` (step 3
 * of the transition); reading it stays forever.
 */
export const SEND_ISACLOUD_QUOTE = true;

/**
 * `createMessageStanza` handler: for a legacy-OMEMO message, adds the
 * `<reply>` and, unless this is a correction, the `<fallback>` as direct
 * children of `<message>`, siblings of the `<encrypted>`. Must run after the
 * OMEMO handler, which is what inserts `<encrypted>`. Nothing is touched
 * inside the encrypted payload, and the fallback range is the one computed on
 * the text body before it was encrypted.
 * @param {any} _chat
 * @param {{ message: any, stanza: any }} data
 * @returns {{ message: any, stanza: any }}
 */
export function addCleartextReply(_chat, data) {
    const { message, stanza } = data;
    const reply_to_id = message.get('reply_to_id');
    if (!message.get('is_encrypted') || !reply_to_id) return data;
    // omemo:2 has no cleartext `<encrypted>`: its reply already travels inside
    // the SCE `<content>`, so there is nothing to add here.
    if (!hasDirectChild(stanza, 'encrypted', Strophe.NS.OMEMO)) return data;
    // Defense: never send a second `<reply>` if one is already in the clear.
    if (hasDirectChild(stanza, 'reply', Strophe.NS.REPLY)) return data;

    stanza
        .cnode(stx`<reply xmlns="${Strophe.NS.REPLY}" id="${reply_to_id}" to="${message.get('reply_to') || ''}"/>`)
        .root();

    // isaCloud: corrections rebuild the quote and its fallback for the corrected
    // body (see `sendMessage`), so it goes out here too, keeping the quote that
    // the apps draw from the body after an edit.
    const reply_fallback = message.get('fallback')?.[Strophe.NS.REPLY];
    if (reply_fallback) {
        stanza
            .cnode(
                stx`<fallback xmlns="${Strophe.NS.FALLBACK}" for="${Strophe.NS.REPLY}"><body start="${reply_fallback.start}" end="${reply_fallback.end}"/></fallback>`,
            )
            .root();
    }
    return data;
}

/**
 * `createMessageStanza` handler: adds the `<isacloud-quote>` marker for a reply
 * to media, as a direct child of `<message>` and outside the encryption.
 * @param {any} chat
 * @param {{ message: any, stanza: any }} data
 * @returns {{ message: any, stanza: any }}
 */
export function addIsacloudQuoteMarker(chat, data) {
    const { message, stanza } = data;
    if (!SEND_ISACLOUD_QUOTE) return data;

    let quote_id = message.get('isacloud_quote_id');
    if (!quote_id && message.get('reply_to_id') && chat?.getReferencedMessage) {
        // A correction of a reply sent before this build carries no saved flag;
        // resolve it again so the marker isn't lost on the edit.
        const original = chat.getReferencedMessage(message.get('reply_to_id'));
        if (isReplyMediaMessage(original)) quote_id = message.get('reply_to_id');
    }
    if (!quote_id) return data;
    // Only a cleartext message or a legacy-OMEMO one can be read by the apps
    // that still use the marker; in omemo:2 it would only leak metadata.
    if (message.get('is_encrypted') && !hasDirectChild(stanza, 'encrypted', Strophe.NS.OMEMO)) return data;
    if (hasDirectChild(stanza, 'isacloud-quote', NS_ISACLOUD_QUOTE)) return data;

    stanza.cnode(stx`<isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="${quote_id}"/>`).root();
    return data;
}

/**
 * Whether a message is the kind of media the contract covers for
 * `<isacloud-quote>`: a sticker, a photo or a GIF. Video and audio are
 * deliberately out (the iOS contract only covers photo, GIF and sticker).
 * @param {any} message
 * @returns {boolean}
 */
export function isReplyMediaMessage(message) {
    if (!message) return false;
    if (message.get('isacloud_sticker')) return true;
    const media_urls = message.get('media_urls') ?? [];
    return media_urls.some((item) => !!(item.is_image || item.is_gif));
}

/**
 * `getOutgoingMessageAttributes` handler: remembers that the message replies
 * to media, so `addIsacloudQuoteMarker` knows to send the marker. It is saved
 * with the message, so a resend after a failure keeps it.
 * @param {any} chat
 * @param {Object} attrs
 * @returns {Object}
 */
export function markIsacloudQuote(chat, attrs) {
    if (!attrs?.reply_to_id) return attrs;
    const replied = chat.getReferencedMessage?.(attrs.reply_to_id);
    if (!isReplyMediaMessage(replied)) return attrs;
    return { ...attrs, isacloud_quote_id: attrs.reply_to_id };
}

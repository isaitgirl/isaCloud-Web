import { converse } from '@converse/headless';

const { Strophe, sizzle } = converse.env;

/** Namespace of the sticker marker, the same one the isaCloud iOS client sends. */
export const NS_STICKERS = 'urn:xmpp:stickers:0';

Strophe.addNamespace('STICKERS', NS_STICKERS);

/**
 * Returns whether the message element has a `<sticker/>` child in the
 * stickers namespace as a DIRECT child. Strophe and sizzle match namespaces at
 * any depth, which would also catch an element nested inside another extension.
 * @param {Element} message - A `<message>` element, already unwrapped from any carbon or MAM envelope.
 * @returns {boolean}
 */
export function hasStickerMarker(message) {
    return Array.from(message.children).some(
        (child) => child.localName === 'sticker' && child.namespaceURI === NS_STICKERS,
    );
}

/**
 * Returns the `<message>` that carries the content for a MUC stanza: the one
 * forwarded inside a MAM result when the stanza is an archive result, else the
 * stanza itself. Mirrors the selector used by `parseMUCMessage`.
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

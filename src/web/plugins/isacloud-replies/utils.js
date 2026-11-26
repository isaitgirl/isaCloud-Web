/**
 * @description
 *  isaCloud: shared helpers of the replies plugin (XEP-0461).
 *
 *  The isaCloud Android app has long sent replies as a plain
 *  `<isacloud-quote xmlns='urn:isacloud:quote:0' id='…'/>` marker instead of
 *  the structured `<reply>`. This plugin reads it as a fallback and sends it
 *  during the transition, and keeps the reply metadata in the clear for the
 *  legacy OMEMO payload.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';

const { Strophe, sizzle } = converse.env;

/** Namespace of the isaCloud quote marker, the same one the Android app sends. */
export const NS_ISACLOUD_QUOTE = 'urn:isacloud:quote:0';

Strophe.addNamespace('ISACLOUD_QUOTE', NS_ISACLOUD_QUOTE);

/**
 * Returns a stanza as a DOM element, whether it is an element already or a
 * Strophe builder.
 * @param {Element|import('strophe.js').Builder} stanza
 * @returns {Element}
 */
export function toElement(stanza) {
    return /** @type {any} */ (stanza)?.tree ? /** @type {any} */ (stanza).tree() : /** @type {Element} */ (stanza);
}

/**
 * Returns the direct child with the given local name and namespace, if any.
 * sizzle and Strophe match namespaces at any depth, which would also catch an
 * element nested inside another extension, so children are inspected by hand.
 * @param {Element|import('strophe.js').Builder} stanza
 * @param {string} local_name
 * @param {string} namespace
 * @returns {Element|undefined}
 */
export function getDirectChild(stanza, local_name, namespace) {
    return Array.from(toElement(stanza)?.children ?? []).find(
        (child) => child.localName === local_name && child.namespaceURI === namespace,
    );
}

/**
 * Whether the element has a direct child with the given local name and namespace.
 * @param {Element|import('strophe.js').Builder} stanza
 * @param {string} local_name
 * @param {string} namespace
 * @returns {boolean}
 */
export function hasDirectChild(stanza, local_name, namespace) {
    return !!getDirectChild(stanza, local_name, namespace);
}

/**
 * Returns the `<message>` that carries the content for a MUC stanza: the one
 * forwarded inside a MAM result when the stanza is an archive result, else the
 * stanza itself. Copied from the stickers plugin
 * (`src/plugins/isacloud-stickers/utils.js`), which mirrors the selector used
 * by `parseMUCMessage`; it is duplicated so that the two plugins stay
 * independent.
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

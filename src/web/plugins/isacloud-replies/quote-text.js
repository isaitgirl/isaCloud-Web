/**
 * @description
 *  isaCloud: quote a media marker in the XEP-0461 fallback instead of the
 *  upload URL. Replying to a photo would otherwise quote its URL, which under
 *  OMEMO is an `aesgcm://…` link with the decryption key, and the iOS app draws
 *  the quote from the body.
 *
 *  `BaseMessage.getReplyQuoteText()` is the hook: `addReplyFallback` quotes its
 *  return value. This module wraps it to answer with "📷 Foto", "🎞️ GIF",
 *  "🎬 Vídeo", "🎵 Áudio" or "Figurinha" when the message is only media; when
 *  there is a caption, the original text (the caption) is kept.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { BaseMessage, log } from '@converse/headless';
import { t } from './i18n.js';

const WRAPPED = Symbol('isacloud-replies-quote-text');

/**
 * Returns the marker for a message that is only media, or `undefined` when the
 * message has real text (a caption) or isn't media at all.
 * @param {any} message
 * @returns {string|undefined}
 */
export function getMediaQuoteText(message) {
    if (message.get('isacloud_sticker')) return t('Sticker');

    const media_urls = message.get('media_urls') ?? [];
    if (!media_urls.length) return undefined;

    // Only media: remove every media URL from the body. Anything left is real
    // text (a caption), which is what should be quoted.
    let remaining = message.getMessageText() ?? '';
    for (const item of media_urls) {
        if (item.url) remaining = remaining.split(item.url).join('');
    }
    if (remaining.trim()) return undefined;

    if (media_urls.some((item) => item.is_video)) return `🎬 ${t('Video')}`;
    if (media_urls.some((item) => item.is_gif)) return `🎞️ ${t('GIF')}`;
    if (media_urls.some((item) => item.is_audio)) return `🎵 ${t('Audio')}`;
    if (media_urls.some((item) => item.is_image)) return `📷 ${t('Photo')}`;
    return undefined;
}

/**
 * Whether {@link wrapGetReplyQuoteText} has already run. Also the guard test
 * for the wrap, so that an upstream rename doesn't silently lose the marker.
 * @returns {boolean}
 */
export function isQuoteTextWrapped() {
    return !!(/** @type {any} */ (BaseMessage.prototype)[WRAPPED]);
}

/**
 * Wraps `BaseMessage.prototype.getReplyQuoteText` so that a media message
 * quotes its marker instead of its URL. Wraps once; when the method is missing
 * it warns and leaves things as they are, which only degrades the quote text.
 * @returns {void}
 */
export function wrapGetReplyQuoteText() {
    const proto = /** @type {any} */ (BaseMessage.prototype);
    if (proto[WRAPPED]) return;

    const original = proto.getReplyQuoteText;
    if (typeof original !== 'function') {
        log.warn('isacloud-replies: BaseMessage.getReplyQuoteText not found, media replies will quote the URL');
        return;
    }

    proto.getReplyQuoteText = function () {
        return getMediaQuoteText(this) ?? original.call(this);
    };
    proto[WRAPPED] = true;
}

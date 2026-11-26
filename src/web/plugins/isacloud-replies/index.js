/**
 * @description
 *  isaCloud: XEP-0461 replies for the isaCloud apps.
 *
 *  Hooks used:
 *  - `parseMessage` / `parseMUCMessage` (read): take the id from an
 *    `<isacloud-quote>` when there is no `<reply>`, and synthesize the missing
 *    fallback from the `>` quote in the body (old Android messages).
 *  - `getOutgoingMessageAttributes` (send): remember when a reply is to a
 *    photo, GIF or sticker, so the transition marker is sent.
 *  - `createMessageStanza` (send): add `<reply>`/`<fallback>` in the clear for
 *    the legacy OMEMO payload, and the `<isacloud-quote>` marker. Registered
 *    after the OMEMO handler (like the stickers marker), so it runs once
 *    `<encrypted>` is in the stanza; a guard spec checks the ordering.
 *
 *  `BaseMessage.getReplyQuoteText()` is wrapped (see `quote-text.js`) to quote a
 *  media marker instead of the upload URL.
 *
 *  `ReplyContext.scrollToRepliedMessage` is wrapped (see `jump.js`): tapping the
 *  reply card loads missing history, moves the virtualized window and scrolls
 *  to the original, or says that it is unavailable. Strings are in pt-BR
 *  through `i18n.js`, without `.po` edits.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, converse } from '@converse/headless';
import { MAX_LOADED_MESSAGES, installJump, isJumpWrapped } from './jump.js';
import { addIsacloudQuote, addIsacloudQuoteToMUC, synthesizeQuoteFallback } from './parse.js';
import { getMediaQuoteText, isQuoteTextWrapped, wrapGetReplyQuoteText } from './quote-text.js';
import {
    SEND_ISACLOUD_QUOTE,
    addCleartextReply,
    addIsacloudQuoteMarker,
    isReplyMediaMessage,
    markIsacloudQuote,
} from './send.js';
import { NS_ISACLOUD_QUOTE, getInnerMUCMessage } from './utils.js';

converse.plugins.add('converse-isacloud-replies', {
    dependencies: ['converse-chatview', 'converse-muc-views'],

    initialize() {
        api.listen.on('parseMessage', addIsacloudQuote);
        api.listen.on('parseMUCMessage', addIsacloudQuoteToMUC);
        api.listen.on('getOutgoingMessageAttributes', markIsacloudQuote);
        api.listen.on('createMessageStanza', (chat, data) =>
            addIsacloudQuoteMarker(chat, addCleartextReply(chat, data)),
        );

        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_replies = {
            MAX_LOADED_MESSAGES,
            NS_ISACLOUD_QUOTE,
            SEND_ISACLOUD_QUOTE,
            addCleartextReply,
            addIsacloudQuote,
            addIsacloudQuoteMarker,
            addIsacloudQuoteToMUC,
            getInnerMUCMessage,
            getMediaQuoteText,
            installJump,
            isJumpWrapped,
            isQuoteTextWrapped,
            isReplyMediaMessage,
            markIsacloudQuote,
            synthesizeQuoteFallback,
        };

        wrapGetReplyQuoteText();

        // The element is only registered when converse.initialize() runs, after
        // plugins have been initialized, so wait for it (as the stickers do).
        customElements.whenDefined('converse-reply-context').then(installJump);
    },
});

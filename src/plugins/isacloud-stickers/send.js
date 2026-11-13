/**
 * @description
 *  isaCloud: sending a sticker (phase 2). A sticker goes out as an ordinary
 *  HTTP Upload, plus the empty `<sticker/>` marker as a direct child of the
 *  `<message>`, outside any OMEMO payload.
 *
 *  The upload's file is matched by a name this module generates, because the
 *  OMEMO `beforeFileUpload` hook swaps the File for an encrypted one that keeps
 *  the name. When the upload finishes, its body is remembered: uploading creates
 *  the message that is sent, through `onMessageUploadChanged`, which copies only
 *  body, spoiler and URL, so the marker is put back by link in
 *  `createMessageStanza`, and saved with the message so that a resend keeps it.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { converse } from '@converse/headless';
import { NS_STICKERS } from './utils.js';

const { stx } = converse.env;

/** File names of stickers whose upload is in progress. */
const pending_names = new Set();

/**
 * Bodies (the upload link, or the `aesgcm://` link under OMEMO) of stickers
 * whose upload has finished and that are about to be sent.
 */
const sticker_bodies = new Set();

/**
 * Uploads a sticker PNG and sends it to the chat.
 * @param {any} chat
 * @param {Blob} blob - A PNG from `toStickerPNG`.
 * @returns {Promise<any[]>} The placeholder messages, as `sendFiles` returns them.
 */
export async function sendSticker(chat, blob) {
    const name = `${crypto.randomUUID()}.png`;
    pending_names.add(name);
    const file = new File([blob], name, { type: 'image/png' });
    const messages = await chat.sendFiles([file]);
    // Without a placeholder, no upload will finish, so nothing is left to match.
    if (!messages?.length) pending_names.delete(name);
    return messages;
}

/**
 * `afterFileUploaded` handler: marks the placeholder of a sticker upload.
 * @param {any} message
 * @param {Object} attrs
 * @returns {Object}
 */
export function markUploadedSticker(message, attrs) {
    const name = message.file?.name;
    if (!name || !pending_names.delete(name)) return attrs;
    // Not oob_url: under OMEMO the link moves into the body, and oob_url is cleared.
    if (attrs.body) sticker_bodies.add(attrs.body);
    return { ...attrs, isacloud_sticker: true };
}

/**
 * `createMessageStanza` handler: adds the `<sticker/>` marker to a sticker
 * message. Listed after OMEMO's handler, so the marker stays outside the
 * encrypted payload.
 * @param {any} _chat
 * @param {{ message: any, stanza: any }} data
 * @returns {{ message: any, stanza: any }}
 */
export function addStickerMarker(_chat, data) {
    const { message, stanza } = data;
    // Under OMEMO the body is the fallback text, and the link is in `plaintext`.
    const link = message.get('is_encrypted') ? message.get('plaintext') : message.get('body');
    if (!message.get('isacloud_sticker') && sticker_bodies.delete(link)) {
        // Saved, so that a message that fails and is resent later keeps its marker.
        message.save({ isacloud_sticker: true });
    }
    if (message.get('isacloud_sticker')) {
        stanza.cnode(stx`<sticker xmlns="${NS_STICKERS}"/>`).root();
    }
    return data;
}

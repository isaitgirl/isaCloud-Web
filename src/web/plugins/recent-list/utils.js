/**
 * @typedef {import('@converse/headless').Model} Model
 * @typedef {'chat'|'group'|'channel'} ConversationKind
 */
import { _converse, api, constants, converse, u } from '@converse/headless';
import { __ } from 'i18n';

const { dayjs } = converse.env;
const { CHATROOMS_TYPE, PRIVATE_CHAT_TYPE } = constants;

const MAX_PREVIEW_LENGTH = 120;
const URL_ONLY_REGEX = /^https?:\/\/\S+$/;

/** The most conversations that can be pinned to the top of the list. */
export const MAX_PINNED = 3;

/**
 * Whether a conversation is pinned to the top of the list. `pinned_order` is 0
 * or absent for unpinned conversations, and the pin position otherwise.
 * @param {Model} model
 * @returns {boolean}
 */
export function isPinned(model) {
    return Number(model.get('pinned_order')) > 0;
}

/**
 * The 1:1 chats and groupchats in the list. Closed groupchats have left the
 * room and are not listed; closed 1:1 chats are kept.
 * @returns {Model[]}
 */
export function getConversations() {
    const { chatboxes } = _converse.state;
    return chatboxes.filter(
        (model) => isConversation(model) && !(model.get('type') === CHATROOMS_TYPE && model.get('closed')),
    );
}

/**
 * The conversations that are pinned to the top of the list, regardless of
 * their order.
 * @returns {Model[]}
 */
export function getPinnedConversations() {
    return getConversations().filter((model) => isPinned(model));
}

/** @returns {number} */
export function getPinnedCount() {
    return getPinnedConversations().length;
}

/**
 * Whether a conversation can be pinned: it isn't pinned already and there is
 * room below the limit.
 * @param {Model} model
 * @returns {boolean}
 */
export function canPin(model) {
    return !isPinned(model) && getPinnedCount() < MAX_PINNED;
}

/**
 * Pins a conversation below the ones already pinned.
 * @param {Model} model
 */
export function pinConversation(model) {
    if (!canPin(model)) return;
    const orders = getPinnedConversations().map((m) => Number(m.get('pinned_order')));
    // The first pinned conversation is 1; later pins append below it.
    u.safeSave(model, { pinned_order: Math.max(0, ...orders) + 1 });
}

/** @param {Model} model */
export function unpinConversation(model) {
    if (isPinned(model)) u.safeSave(model, { pinned_order: 0 });
}

/** @param {Model} model */
export function togglePin(model) {
    if (isPinned(model)) {
        unpinConversation(model);
    } else {
        pinConversation(model);
    }
}

/** @param {Model} model */
export function isConversation(model) {
    const type = model.get('type');
    return type === PRIVATE_CHAT_TYPE || type === CHATROOMS_TYPE;
}

/**
 * Whether the conversation is a 1:1 chat with our own bare JID.
 * @param {Model} model
 * @returns {boolean}
 */
export function isSelfChat(model) {
    return (
        model.get('type') === PRIVATE_CHAT_TYPE && u.isSameBareJID(model.get('jid'), _converse.session.get('bare_jid'))
    );
}

/**
 * Whether the conversation is the "Notes to self" chat, which only exists for
 * the user's own JID and when the setting is enabled.
 * @param {Model} model
 * @returns {boolean}
 */
export function isNotesToSelf(model) {
    return api.settings.get('notes_to_self') && isSelfChat(model);
}

/**
 * @param {Model} model
 * @returns {ConversationKind}
 */
export function getConversationKind(model) {
    if (model.get('type') !== CHATROOMS_TYPE) return 'chat';
    // The rule of the isaCloud iOS app (Monal) and of
    // https://docs.modernxmpp.org/client/groupchat/: a group is members-only
    // and non-anonymous; every other room is a channel.
    return /** @type {import('@converse/headless').MUC} */ (model).isGroup?.() ? 'group' : 'channel';
}

/**
 * Whether a message is something the user sees as content in the list. Errors,
 * info notices, retractions and empty stanzas are skipped.
 * @param {Model} message
 */
export function isDisplayableMessage(message) {
    if (message.get('is_error') || message.get('retracted') || message.get('type') === 'info') return false;
    return !!(message.get('body') || message.get('plaintext') || message.get('oob_url') || message.get('is_encrypted'));
}

/**
 * Whether a conversation has something to show in the recent list. 1:1 chats
 * are always listed, except "Notes to self", which only appears once it has a
 * displayable message. A groupchat is listed while its initial history fetch is
 * still in flight, and afterwards only if it has a displayable message, so a
 * room whose archive is empty doesn't clutter the list. A room this client has
 * just created is kept even when its archive is empty, so it doesn't vanish
 * before the user can use it.
 * @param {Model} model
 * @returns {boolean}
 */
export function hasConversationContent(model) {
    if (isNotesToSelf(model)) return !!getLastDisplayableMessage(model);
    if (model.get('type') !== CHATROOMS_TYPE) return true;
    if (model.get('is_new_room')) return true;
    if (!model.session?.get('mam_initialized')) return true;
    return !!getLastDisplayableMessage(model);
}

/**
 * @param {Model} model
 * @returns {Model|undefined}
 */
export function getLastDisplayableMessage(model) {
    const messages = model.messages?.models ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
        if (isDisplayableMessage(messages[i])) return messages[i];
    }
    return undefined;
}

/** @param {string|undefined} time */
function toMilliseconds(time) {
    const ms = time ? new Date(time).getTime() : NaN;
    return Number.isNaN(ms) ? undefined : ms;
}

/**
 * The time of the last visible activity in milliseconds. Falls back to the
 * cached value (so the order survives a reload before messages are fetched)
 * and finally to when the conversation was opened.
 * @param {Model} model
 * @returns {number}
 */
export function getLastActivity(model) {
    const message = getLastDisplayableMessage(model);
    const message_ms = message ? toMilliseconds(message.get('time')) : undefined;
    if (message_ms) return message_ms;
    return model.get('recent_activity') || model.get('time_opened') || 0;
}

/**
 * @param {string} text
 */
function truncate(text) {
    const chars = Array.from(text);
    return chars.length > MAX_PREVIEW_LENGTH ? `${chars.slice(0, MAX_PREVIEW_LENGTH).join('')}…` : text;
}

/**
 * @param {Model} message
 * @returns {string}
 */
function getPreviewText(message) {
    if (message.get('is_encrypted') && !message.get('plaintext')) {
        return `🔒 ${__('Encrypted message')}`;
    }
    const body = (message.getMessageText() || '').trim();
    const media_url = message.get('oob_url') || (URL_ONLY_REGEX.test(body) ? body : '');
    if (media_url) {
        if (u.isImageURL(media_url)) return `📷 ${__('Image')}`;
        if (u.isVideoURL(media_url)) return `🎬 ${__('Video')}`;
        if (u.isAudioURL(media_url)) return `🎤 ${__('Audio')}`;
        if (!body || body === media_url) return `📎 ${__('File')}`;
    }
    if (!body) return `📎 ${__('File')}`;
    return truncate(body.replace(/\s+/g, ' '));
}

/**
 * @param {Model} model
 * @param {Model} message
 * @returns {string}
 */
function getPreviewPrefix(model, message) {
    if (isNotesToSelf(model)) return '';
    if (message.get('sender') === 'me') return __('You');
    if (getConversationKind(model) === 'chat') return '';
    return message.getDisplayName?.() || message.get('nick') || '';
}

/**
 * Computes the preview of the last message from its messages collection.
 * @param {Model} model
 * @param {Model} message
 * @returns {{ prefix: string, text: string }}
 */
export function computePreview(model, message) {
    return { prefix: getPreviewPrefix(model, message), text: getPreviewText(message) };
}

/**
 * The preview line of a conversation. Uses the cached preview while the
 * messages have not been fetched yet.
 * @param {Model} model
 * @returns {{ prefix: string, text: string }}
 */
export function getPreview(model) {
    const message = getLastDisplayableMessage(model);
    if (message) return computePreview(model, message);
    return model.get('recent_preview') || { prefix: '', text: '' };
}

/**
 * @param {Model} model
 * @returns {boolean}
 */
export function isUnread(model) {
    if (getConversationKind(model) === 'chat') return (model.get('num_unread') || 0) > 0;
    return !!(model.get('num_unread_general') || model.get('num_unread') || model.get('has_activity'));
}

/**
 * @param {Model} model
 * @returns {number}
 */
export function getUnreadCount(model) {
    if (getConversationKind(model) === 'chat') return model.get('num_unread') || 0;
    return Math.max(model.get('num_unread_general') || 0, model.get('num_unread') || 0);
}

/** @param {number} count */
export function formatUnreadCount(count) {
    return count < 100 ? String(count) : '99+';
}

/**
 * @param {Model} model
 * @param {string} filter
 */
export function matchesFilter(model, filter) {
    switch (filter) {
        case 'unread':
            return isUnread(model);
        case 'contacts':
            return getConversationKind(model) === 'chat';
        case 'groups':
            return getConversationKind(model) === 'group';
        case 'channels':
            return getConversationKind(model) === 'channel';
        default:
            return true;
    }
}

/**
 * Formats the time of the last activity: the clock time for today, "Yesterday",
 * the day and month within the current year, and the full date otherwise.
 * @param {number} ms
 * @param {number} [now]
 */
export function formatActivityTime(ms, now = Date.now()) {
    if (!ms) return '';
    const time = dayjs(ms);
    const today = dayjs(now);
    if (time.isSame(today, 'day')) return time.format('HH:mm');
    if (time.isSame(today.subtract(1, 'day'), 'day')) return __('Yesterday');
    if (time.isSame(today, 'year')) return time.format('D MMM');
    return time.format('DD/MM/YY');
}

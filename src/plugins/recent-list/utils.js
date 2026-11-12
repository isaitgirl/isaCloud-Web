/**
 * @typedef {import('@converse/headless').Model} Model
 * @typedef {'chat'|'group'|'channel'} ConversationKind
 */
import { constants, converse, u } from '@converse/headless';
import { __ } from 'i18n';

const { dayjs } = converse.env;
const { CHATROOMS_TYPE, PRIVATE_CHAT_TYPE } = constants;

const MAX_PREVIEW_LENGTH = 120;
const URL_ONLY_REGEX = /^https?:\/\/\S+$/;

/** @param {Model} model */
export function isConversation(model) {
    const type = model.get('type');
    return type === PRIVATE_CHAT_TYPE || type === CHATROOMS_TYPE;
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
    const features = model.features;
    return features?.get('membersonly') && features?.get('nonanonymous') ? 'group' : 'channel';
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

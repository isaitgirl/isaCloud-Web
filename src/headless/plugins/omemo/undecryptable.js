/**
 * @typedef {import('../../shared/chatbox.js').default} ChatBox
 * @typedef {import('./types').UndecryptableState} UndecryptableState
 */
import _converse from '../../shared/_converse.js';
import { getStanzaIDsByJID } from '../../shared/parsers.js';

export const NOT_FOR_THIS_DEVICE = 'not-encrypted-for-this-device';

// Caps each list so that a long MAM backlog can't bloat the persisted chatbox.
const MAX_IDS = 500;

/**
 * @param {Record<string, any>} attrs
 * @returns {string|null} The XEP-0359 stanza-id when there is one, else the message id.
 */
function getIdentifier(attrs) {
    return Object.values(getStanzaIDsByJID(attrs))[0] || attrs.msgid || null;
}

/**
 * @param {Record<string, any>} attrs
 * @returns {boolean} Whether the message is older than this device's OMEMO store.
 */
function isHistory(attrs) {
    if (attrs.is_archived) return true;
    const created_at = _converse.state.omemo_store?.get('created_at');
    if (!created_at || !attrs.time) return false;
    const time = new Date(attrs.time).getTime();
    return !Number.isNaN(time) && time < new Date(created_at).getTime();
}

/**
 * @param {ChatBox} chatbox
 * @returns {UndecryptableState}
 */
function getState(chatbox) {
    const state = chatbox.get('omemo_undecryptable') || {};
    return {
        history: [...(state.history || [])],
        recent: [...(state.recent || [])],
        dismissed_total: state.dismissed_total || 0,
    };
}

/**
 * Hook listener for `beforeMessageCreated`. Undecryptable messages which are
 * not for this device are counted on the chatbox rather than shown as a line
 * each, so that a MAM refetch can't flood the conversation with them.
 * @param {ChatBox} chatbox
 * @param {Record<string, any>} attrs
 * @param {{ handled: boolean }} data
 * @returns {Record<string, any>|{ handled: boolean }}
 */
export function recordUndecryptable(chatbox, attrs, data) {
    // `api.hook` chains its second argument (here `attrs`) from one listener to
    // the next, while `data` is passed to each one as an extra argument. So a
    // listener that doesn't handle the message must hand `attrs` on, or later
    // listeners (e.g. dangling reactions) never see them.
    if (attrs.error_condition !== NOT_FOR_THIS_DEVICE) return attrs;

    const state = getState(chatbox);
    if (addToState(state, attrs)) chatbox.save({ omemo_undecryptable: state });
    // Every listener gets this same object, so a listener registered after us
    // which hands back its own `data` argument can't undo the handling.
    return Object.assign(data, { handled: true });
}

/**
 * Counts one undecryptable message in `state`, unless it is already counted.
 * @param {UndecryptableState} state
 * @param {Record<string, any>} attrs
 * @returns {boolean} Whether `state` changed.
 */
function addToState(state, attrs) {
    const id = getIdentifier(attrs);
    if (!id || state.history.includes(id) || state.recent.includes(id)) return false;
    const key = isHistory(attrs) ? 'history' : 'recent';
    state[key] = [...state[key], id].slice(-MAX_IDS);
    return true;
}

/**
 * Listener for `afterMessagesFetched`. Earlier versions stored each
 * undecryptable message as an error line in the chat. When the archive delivers
 * such a message again it matches the stored line, so it never reaches
 * {@link recordUndecryptable}. Count those stored lines and remove them.
 * @param {ChatBox} chatbox
 */
export function absorbStoredUndecryptable(chatbox) {
    const stored = chatbox.messages?.filter((m) => m.get('error_condition') === NOT_FOR_THIS_DEVICE) ?? [];
    if (!stored.length) return;

    const state = getState(chatbox);
    const changed = stored.map((m) => addToState(state, m.attributes)).some(Boolean);
    if (changed) chatbox.save({ omemo_undecryptable: state });
    stored.forEach((m) => m.destroy());
}

/**
 * Hook listener for `afterMessageCreated`. A message which was undecryptable
 * before but can now be read is no longer counted.
 * @param {ChatBox} chatbox
 * @param {import('../../shared/types').MessageAttributes & Record<string, any>} message
 * @returns {any}
 */
export function clearUndecryptable(chatbox, message) {
    if (!chatbox.get('omemo_undecryptable')) return message;

    const attrs = message.attributes ?? message;
    const ids = [...Object.values(getStanzaIDsByJID(attrs)), attrs.msgid, attrs.origin_id].filter(Boolean);
    const state = getState(chatbox);
    const before = state.history.length + state.recent.length;
    state.history = state.history.filter((id) => !ids.includes(id));
    state.recent = state.recent.filter((id) => !ids.includes(id));
    const total = state.history.length + state.recent.length;
    if (total !== before) {
        // Keep the notice from reappearing for failures the user already saw.
        state.dismissed_total = Math.min(state.dismissed_total, total);
        chatbox.save({ omemo_undecryptable: state });
    }
    return message;
}

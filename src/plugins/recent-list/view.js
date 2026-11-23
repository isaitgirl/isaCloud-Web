/**
 * @description
 *  The conversation list shown in the sidebar of the Chat app. It mixes 1:1
 *  chats and groupchats, most recent activity first.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, Model, u } from '@converse/headless';
import { __ } from 'i18n';
import { CHANGELOG_EVENT, changelog_state } from 'plugins/isacloud-changelog/state.js';
import { CustomElement } from 'shared/components/element.js';
import tplRecentList from './templates/recent-list.js';
import {
    computePreview,
    getConversationKind,
    getConversations,
    getLastActivity,
    getLastDisplayableMessage,
    hasConversationContent,
    isConversation,
    isPinned,
    matchesFilter,
} from './utils.js';

/**
 * Orders conversations by display name, falling back to the JID so that
 * conversations with the same name keep a stable order.
 * @param {import('@converse/headless').Model} a
 * @param {import('@converse/headless').Model} b
 */
function compareNames(a, b) {
    const name_a = a.getDisplayName().toLowerCase();
    const name_b = b.getDisplayName().toLowerCase();
    if (name_a !== name_b) return name_a < name_b ? -1 : 1;
    return a.get('jid') < b.get('jid') ? -1 : a.get('jid') > b.get('jid') ? 1 : 0;
}

/**
 * One entry of the conversation list.
 * @typedef {Object} RecentItem
 * @property {import('@converse/headless').Model} model
 * @property {string} kind
 * @property {number} activity
 * @property {number} pinned_order The pin position, 0 when not pinned.
 */

/**
 * Pinned conversations come first, in the order they were pinned, so the
 * first pin stays on top. The rest follow by most recent activity.
 * @param {RecentItem} a
 * @param {RecentItem} b
 */
function compareItems(a, b) {
    if (a.pinned_order && b.pinned_order) {
        return a.pinned_order - b.pinned_order || compareNames(a.model, b.model);
    }
    if (a.pinned_order) return -1;
    if (b.pinned_order) return 1;
    return b.activity - a.activity || compareNames(a.model, b.model);
}

/**
 * @typedef {Object} RecentListAttrs
 * @property {string} [id]
 * @property {'recent'|'contacts'} view
 * @property {string} filter
 */

/**
 * Persisted per user: which view is shown and which filter is active.
 * @extends {Model<RecentListAttrs>}
 */
class RecentListModel extends Model {
    /** @returns {RecentListAttrs} */
    defaults() {
        return { view: 'recent', filter: 'all' };
    }
}

export class RecentList extends CustomElement {
    static get properties() {
        return {
            renderContacts: { attribute: false },
        };
    }

    initialize() {
        const bare_jid = _converse.session.get('bare_jid');
        const id = `converse.recent-list-${bare_jid}`;
        this.model = new RecentListModel({ id });
        u.initStorage(this.model, id);
        this.model.fetch();

        this.watched = new WeakSet();
        this.scheduleRefresh = u.debounce(() => this.refresh(), 50);
        this.addEventListeners();

        // The changelog row lives in this list but its state is kept by the
        // isacloud-changelog plugin, outside the chatboxes collection.
        this.onChangelogChange = () => this.requestUpdate();
        changelog_state.addEventListener(CHANGELOG_EVENT, this.onChangelogChange);

        this.requestUpdate();
    }

    disconnectedCallback() {
        if (this.onChangelogChange) {
            changelog_state.removeEventListener(CHANGELOG_EVENT, this.onChangelogChange);
        }
        super.disconnectedCallback();
    }

    addEventListeners() {
        const { chatboxes } = _converse.state;
        this.listenTo(chatboxes, 'add remove destroy change vcard:add vcard:change', this.scheduleRefresh);
        this.listenTo(this.model, 'change', () => this.requestUpdate());
        chatboxes.forEach((model) => this.watchConversation(model));
        this.listenTo(chatboxes, 'add', (model) => this.watchConversation(model));
    }

    /**
     * Re-renders (and caches the summaries) when a conversation's messages or
     * room features change.
     * @param {import('@converse/headless').Model} model
     */
    async watchConversation(model) {
        if (!isConversation(model) || this.watched.has(model)) return;
        this.watched.add(model);
        await model.initialized;
        if (model.messages) this.listenTo(model.messages, 'add change remove', this.scheduleRefresh);
        if (model.features) this.listenTo(model.features, 'change', this.scheduleRefresh);
        // A room with an empty archive disappears once its history is known to
        // be settled; a room with history appears when its messages arrive.
        if (model.session) this.listenTo(model.session, 'change:mam_initialized', this.scheduleRefresh);
        this.scheduleRefresh();
    }

    refresh() {
        getConversations().forEach((model) => this.cacheSummary(model));
        this.requestUpdate();
    }

    /**
     * Saves the last activity and preview on the model, only when they changed,
     * so the order survives a reload before the messages are fetched.
     * @param {import('@converse/headless').Model} model
     */
    cacheSummary(model) {
        const message = getLastDisplayableMessage(model);
        if (!message) return;
        const recent_activity = getLastActivity(model);
        const recent_preview = computePreview(model, message);
        if (
            recent_activity !== model.get('recent_activity') ||
            JSON.stringify(recent_preview) !== JSON.stringify(model.get('recent_preview'))
        ) {
            u.safeSave(model, { recent_activity, recent_preview });
        }
    }

    render() {
        return tplRecentList(this);
    }

    /**
     * The conversations shown in the list: those with something to show, plus
     * any pinned conversation (an explicit pin keeps it visible), matching the
     * active filter. Pinned conversations first, in the order they were
     * pinned, then the rest by most recent activity.
     * @returns {RecentItem[]}
     */
    getItems() {
        const filter = this.model.get('filter');
        return getConversations()
            .filter((model) => isPinned(model) || hasConversationContent(model))
            .filter((model) => matchesFilter(model, filter))
            .map((model) => ({
                model,
                kind: getConversationKind(model),
                activity: getLastActivity(model),
                pinned_order: isPinned(model) ? Number(model.get('pinned_order')) : 0,
            }))
            .sort(compareItems);
    }

    showContacts() {
        this.model.save({ view: 'contacts' });
    }

    showRecent() {
        this.model.save({ view: 'recent' });
    }

    /** @param {string} filter */
    setFilter(filter) {
        this.model.save({ filter: this.model.get('filter') === filter ? 'all' : filter });
    }

    /**
     * @param {Event} ev
     * @param {import('@converse/headless').Model} model
     */
    openConversation(ev, model) {
        ev.preventDefault();
        const view = getConversationKind(model) === 'chat' ? 'chat' : 'room';
        api.trigger('openConversation', { view, jid: model.get('jid') });
    }

    /** @param {import('@converse/headless').Model} model */
    async removeChat(model) {
        const confirmed = await api.confirm(__('Confirm'), __('Remove this conversation from the list?'));
        if (confirmed) model.destroy();
    }

    /** @param {import('@converse/headless').Model} room */
    async leaveRoom(room) {
        const confirmed = await api.confirm(
            __('Confirm'),
            __('Are you sure you want to leave the groupchat %1$s?', room.getDisplayName()),
        );
        if (confirmed) room.close();
    }
}

api.elements.define('converse-recent-list', RecentList);

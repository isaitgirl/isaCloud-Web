/**
 * @description
 *  The conversation list shown in the sidebar of the Chat app. It mixes 1:1
 *  chats and groupchats, most recent activity first.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, constants, Model, u } from '@converse/headless';
import { __ } from 'i18n';
import { CustomElement } from 'shared/components/element.js';
import tplRecentList from './templates/recent-list.js';
import {
    computePreview,
    getConversationKind,
    getLastActivity,
    getLastDisplayableMessage,
    isConversation,
    matchesFilter,
} from './utils.js';

const { CHATROOMS_TYPE } = constants;

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
        this.requestUpdate();
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
        this.scheduleRefresh();
    }

    refresh() {
        this.getConversations().forEach((model) => this.cacheSummary(model));
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
     * The 1:1 chats and groupchats in the list. Closed groupchats have left
     * the room and are not listed; closed 1:1 chats are kept.
     */
    getConversations() {
        const { chatboxes } = _converse.state;
        return chatboxes.filter(
            (model) => isConversation(model) && !(model.get('type') === CHATROOMS_TYPE && model.get('closed')),
        );
    }

    /**
     * The conversations matching the active filter, most recent activity first.
     * @returns {{ model: import('@converse/headless').Model, kind: string, activity: number }[]}
     */
    getItems() {
        const filter = this.model.get('filter');
        return this.getConversations()
            .filter((model) => matchesFilter(model, filter))
            .map((model) => ({ model, kind: getConversationKind(model), activity: getLastActivity(model) }))
            .sort((a, b) => b.activity - a.activity || compareNames(a.model, b.model));
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

import { api, MAMPlaceholderMessage } from '@converse/headless';
import { ObservableElement } from 'shared/components/observable.js';
import { isHiddenMessage } from 'shared/chat/utils.js';
import tplPlaceholder from './templates/placeholder.js';

import './styles/placeholder.scss';

/**
 * Pages in a row which the archive filled without bringing anything that's drawn
 * (e.g. only OMEMO messages that this device can't read), after which gaps are no
 * longer filled on their own. Without a limit, a list that never fills the area
 * keeps its placeholder in view and walks back through the whole archive.
 */
export const MAX_EMPTY_AUTO_FILLS = 2;

/**
 * @param {import('@converse/headless').ChatBox|import('@converse/headless').MUC} chat
 * @returns {number} How many of the chat's messages the list draws
 */
function countDrawn(chat) {
    return chat.messages.filter((m) => !(m instanceof MAMPlaceholderMessage) && !isHiddenMessage(m)).length;
}

class Placeholder extends ObservableElement {
    /**
     * @typedef {import('shared/components/types').ObservableProperty} ObservableProperty
     */

    static get properties() {
        return {
            ...super.properties,
            model: { type: Object },
        };
    }

    constructor() {
        super();
        this.model = null;
        this.observable = /** @type {ObservableProperty} */ ('once');
        this.intersectionRatio = 0.1;
    }

    render() {
        return tplPlaceholder(this);
    }

    /**
     * @param {import('lit').PropertyValues} changed
     */
    updated(changed) {
        super.updated(changed);
        if (changed.has('model')) {
            const ui = this.getChat()?.ui;
            if (ui) this.listenTo(ui, 'change:mam_empty_fills', () => this.requestUpdate());
        }
    }

    getChat() {
        return this.model?.collection?.chatbox;
    }

    /**
     * @returns {boolean} Whether gaps are no longer filled on their own, until the user asks.
     */
    isAutoFillPaused() {
        return (this.getChat()?.ui.get('mam_empty_fills') ?? 0) >= MAX_EMPTY_AUTO_FILLS;
    }

    /**
     * Fetches the gap's messages. A fetch asked for by the user counts as the last
     * one allowed without anything to show: if it brings nothing that's drawn, the
     * next gap waits for the user again; if it does, gaps are filled on their own again.
     * @param {Event} [ev] - Present when the user asked for it
     */
    async fetchMissingMessages(ev) {
        ev?.preventDefault?.();
        const chat = this.getChat();
        if (ev) chat?.ui.set('mam_empty_fills', MAX_EMPTY_AUTO_FILLS - 1);
        const before = chat ? countDrawn(chat) : 0;

        await this.model.fetchMissingMessages();
        if (!chat) return;
        // The page's messages are only queued by the fetch.
        await chat.msg_chain;
        const empty_fills = countDrawn(chat) > before ? 0 : (chat.ui.get('mam_empty_fills') ?? 0) + 1;
        chat.ui.set('mam_empty_fills', empty_fills);
    }

    /**
     * @param {IntersectionObserverEntry} _entry
     */
    onVisibilityChanged(_entry) {
        if (
            api.settings.get('auto_fill_history_gaps') &&
            this.isVisible &&
            !this.model.get('fetching') &&
            !this.isAutoFillPaused()
        ) {
            this.fetchMissingMessages();
        }
    }
}

api.elements.define('converse-mam-placeholder', Placeholder);

export default Placeholder;

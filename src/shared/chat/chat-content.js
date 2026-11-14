import { html } from 'lit';
import { api, u } from '@converse/headless';
import { CustomElement } from '../components/element.js';
import { isHiddenMessage, onScrolledDown } from './utils.js';
import './message-history.js';

import './styles/chat-content.scss';

const WINDOW_DELTA = 5; // How much the window should move at a time.
const WINDOW_SIZE = 100;

/**
 * Implements a virtualized list of chat messages, which means only a subset of
 * messages, the `WINDOW_SIZE`, gets rendered to the DOM, and this subset
 * gets updated as the user scrolls up and down.
 */
export default class ChatContent extends CustomElement {
    constructor() {
        super();
        this.model = null;
        this.scrollTop = 0;
        this.scroll_debounce = null;

        // Index of the top message in the virtualized list window.
        // If all messages from the top are shown, this value is equal to zero.
        this.window_top = 0;

        // Index of the bottom message in the virtualized list window.
        // If all messages from the bottom are shown, this value is equal to the total minus one.
        this.window_bottom = 0;

        this.scrollHandler = /** @param {Event} ev */ (ev) => {
            if (this.mark_scrolled_debounce) {
                clearTimeout(this.scroll_debounce);
            }
            this.mark_scrolled_debounce = setTimeout(() => {
                this.#markScrolled(ev);
            }, 250);

            requestAnimationFrame(() => this.#setWindow());
        };
    }

    static get properties() {
        return {
            model: { type: Object },
            window_top: { state: true },
            window_bottom: { state: true },
        };
    }

    async initialize() {
        await this.model.initialized;
        await this.model.messages.fetched;

        this.listenTo(this.model.messages, 'add', () => this.#onNumMessagesChanged());
        this.listenTo(this.model.messages, 'remove', () => this.#onNumMessagesChanged());
        this.listenTo(this.model.messages, 'reset', () => this.#onNumMessagesChanged());
        this.listenTo(this.model.messages, 'change', () => this.requestUpdate());
        // A message that becomes drawable, or stops being, changes what the window counts.
        this.listenTo(
            this.model.messages,
            'change:dangling_reaction change:dangling_retraction change:dangling_moderation change:is_only_key',
            () => this.#onNumMessagesChanged(),
        );
        this.listenTo(this.model.messages, 'rendered', () => u.debounce(() => this.requestUpdate(), 50));
        this.listenTo(this.model, 'historyPruned', () => this.#setWindow());
        this.listenTo(this.model.notifications, 'change', () => this.requestUpdate());
        this.listenTo(this.model.ui, 'change', () => this.requestUpdate());
        this.listenTo(this.model.ui, 'change:scrolled', () => this.scrollDown());

        this.window_bottom = this.#getDrawnMessages().length - 1;
        this.window_top = Math.max(0, this.window_bottom - WINDOW_SIZE);

        this.requestUpdate();
    }

    render() {
        if (!this.model) return '';

        return html`
            <div class="chat-content__messages" @scroll="${/** @param {Event} ev */ (ev) => this.scrollHandler(ev)}">
                <div class="chat-content__notifications">${this.model.getNotificationsText()}</div>
                <converse-message-history
                    .model="${this.model}"
                    .messages="${this.#getDrawnMessages().slice(this.window_top, this.window_bottom + 1)}"
                ></converse-message-history>
            </div>
        `;
    }

    /**
     * The messages the window is made of. Models that draw nothing, such as reactions
     * waiting for the message they're about, are left out: counted, they would take up
     * places in the window and leave the list too short to fill the area, which kept the
     * window from ever following the newest message.
     */
    #getDrawnMessages() {
        return this.model.messages.filter((m) => !isHiddenMessage(m));
    }

    #onNumMessagesChanged() {
        this.#setWindow();
        this.requestUpdate();
    }

    /**
     * Called when the chat content is scrolled up or down.
     * We want to record when the user has scrolled away from
     * the bottom, so that we don't automatically scroll away
     * from what the user is reading when new messages are received.
     * @param {Event} ev
     */
    #markScrolled(ev) {
        let scrolled = true;

        const el = /** @type {HTMLElement} */ (ev.target);
        const is_at_bottom = Math.floor(el.scrollTop) === 0;
        const is_at_top =
            Math.ceil(el.clientHeight - el.scrollTop) >= el.scrollHeight - Math.ceil(el.scrollHeight / 20);

        if (is_at_bottom) {
            scrolled = false;
            onScrolledDown(this.model);
        } else if (is_at_top) {
            /**
             * Triggered once the chat's message area has been scrolled to the top
             * @event _converse#chatBoxScrolledUp
             * @property { _converse.ChatBoxView | MUCView } view
             * @example _converse.api.listen.on('chatBoxScrolledUp', obj => { ... });
             */
            api.trigger('chatBoxScrolledUp', el);
        }
        if (this.model.get('scrolled') !== scrolled) {
            this.model.ui.set({ scrolled });
        }
    }

    /**
     * Sets new window bounds based on whether the scrollbar is at the top or bottom, or otherwise based on which
     * messages are visible within the scrollable area.
     */
    #setWindow() {
        const total_messages = this.#getDrawnMessages().length;
        const container = /** @type {HTMLElement} */ (this.querySelector('.chat-content__messages'));
        if (!container) return;

        // Scrolled all the way down, or nothing to scroll: the window follows the newest message.
        // This is checked first: a list that doesn't fill the area also counts as "at the top".
        const is_at_bottom = Math.abs(container.scrollTop) < 1;
        if (is_at_bottom || container.scrollHeight <= container.clientHeight) {
            this.window_bottom = total_messages - 1;
            this.window_top = Math.max(0, this.window_bottom - WINDOW_SIZE);
            return;
        }

        // The amount before the actual top/bottom where we are close enough to
        // want to update the window. Set to 25% of the scrollable container.
        const delta = Math.ceil(container.scrollHeight / 5);

        const is_at_top = Math.ceil(container.clientHeight - container.scrollTop) >= container.scrollHeight - delta;

        if (is_at_top) {
            this.window_top = Math.max(0, this.window_top - WINDOW_DELTA);
            this.window_bottom = this.window_top + WINDOW_SIZE;
            return;
        }

        const is_close_to_bottom = Math.floor(Math.abs(container.scrollTop)) < delta;
        if (is_close_to_bottom) {
            this.window_bottom = Math.min(total_messages - 1, this.window_bottom + WINDOW_DELTA);
            this.window_top = Math.max(0, this.window_bottom - WINDOW_SIZE);
            return;
        }
    }

    scrollDown() {
        if (this.model.ui.get('scrolled')) {
            return;
        }
        if (this.scrollTo) {
            const behavior = this.scrollTop ? 'smooth' : 'auto';
            this.scrollTo({ top: 0, behavior });
        } else {
            this.scrollTop = 0;
        }
        /**
         * Triggered once the converse-chat-content element has been scrolled down to the bottom.
         * @event _converse#chatBoxScrolledDown
         * @type {object}
         * @property { _converse.ChatBox | _converse.ChatRoom } chatbox - The chat model
         * @example _converse.api.listen.on('chatBoxScrolledDown', obj => { ... });
         */
        api.trigger('chatBoxScrolledDown', { chatbox: this.model });
    }
}

api.elements.define('converse-chat-content', ChatContent);

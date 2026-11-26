/**
 * @description
 *  Converse.js plugin which replaces the sidebar of the Chat app with a single
 *  list of conversations (1:1 chats and groupchats), most recent first. The
 *  original rooms and roster lists are still reachable from the contacts view.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api, constants, converse } from '@converse/headless';
import { __ } from 'i18n';
import { canPin, isConversation, isPinned, togglePin } from './utils.js';
import './view.js';

const { PRIVATE_CHAT_TYPE } = constants;

converse.plugins.add('converse-recent-list', {
    dependencies: [
        'converse-app-chat',
        'converse-roomslist',
        'converse-rosterview',
        'converse-chatboxes',
        'converse-muc',
    ],

    initialize() {
        api.settings.extend({
            show_recent_list: false,
        });

        if (!api.settings.get('show_recent_list')) return;

        const app = api.apps.get('chat');
        if (app) {
            const original = app.renderControlbox;
            app.renderControlbox = () =>
                html`<converse-recent-list .renderContacts=${original}></converse-recent-list>`;
        }

        // The conversation's own header menu exposes the same pin, so the
        // user can pin it without going back to the list.
        api.listen.on('getHeadingButtons', (view, buttons) => {
            const model = view.model;
            if (!model || !isConversation(model)) return buttons;

            const pinned = isPinned(model);
            const can_pin = canPin(model);
            const button = {
                'a_class': pinned ? 'unpin-conversation' : 'pin-conversation',
                'handler': (ev) => {
                    ev?.preventDefault?.();
                    togglePin(model);
                },
                'i18n_text': pinned ? __('Unpin from top') : __('Pin to top'),
                'i18n_title': pinned
                    ? __('Unpin from top')
                    : can_pin
                      ? __('Pin to top')
                      : __('You can pin up to 3 conversations'),
                'icon_class': 'fa-thumbtack',
                'name': 'pin-conversation',
                'standalone': false,
                'disabled': !pinned && !can_pin,
            };
            const names = buttons.map((b) => b.name);
            const close_idx = names.indexOf('close');
            const leave_idx = names.indexOf('signout');
            const idx = close_idx > -1 ? close_idx : leave_idx;
            return idx > -1 ? [...buttons.slice(0, idx), button, ...buttons.slice(idx)] : [...buttons, button];
        });

        // A group (not a channel) takes the 1:1 chats' colour, as in the list.
        api.listen.on('chatRoomViewInitialized', (view) => {
            const update = () => view.classList.toggle('chatroom--group', view.model.isGroup());
            view.listenTo(view.model.features, 'change', update);
            update();
        });

        // Closing a 1:1 chat keeps it in the list (it is saved as closed).
        // Closing a groupchat still leaves it, so it is removed from the list.
        api.listen.on('shouldDestroyOnClose', (chatbox, should_destroy) => {
            if (chatbox.get('type') === PRIVATE_CHAT_TYPE) return false;
            return should_destroy;
        });
    },
});

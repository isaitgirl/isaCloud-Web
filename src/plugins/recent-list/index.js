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

import { describe, it, expect } from 'vitest';
import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
const muc_jid = 'coven@chat.shakespeare.lit';

/**
 * The Chat app, once the app switcher has mounted it.
 * @returns {Promise<any>}
 */
async function getChatApp() {
    return u.waitUntil(() => document.querySelector('converse-app-chat'));
}

describe('Closing a conversation with Escape', function () {
    it(
        'hides a one-to-one chat from the composer, keeping it, the draft and the empty area',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);
            const chatbox = view.model;
            const app = await getChatApp();
            await app.updateComplete;

            await mock.setComposerText(view, 'half a thought');
            expect(app.querySelector('.chat-placeholder')).toBe(null);

            await mock.pressComposerKey(view, 'Escape');

            await u.waitUntil(() => chatbox.get('hidden') === true);
            // Hiding is not closing: the chatbox stays around, ready to be reopened.
            expect(_converse.state.chatboxes.get(contact_jid)).toBe(chatbox);
            expect(chatbox.get('closed')).toBeFalsy();
            expect(chatbox.get('draft')).toBe('half a thought');
            await u.waitUntil(() => view.isConnected === false);

            const placeholder = await u.waitUntil(() => app.querySelector('.chat-placeholder'));
            expect(placeholder.querySelector('.chat-placeholder__logo')).not.toBe(null);
            expect(placeholder.querySelector('.chat-placeholder__version').textContent.trim()).toBe(
                converse.env.VERSION_NAME,
            );
            expect(placeholder.querySelector('.chat-placeholder__encryption').textContent).toContain(
                'Your personal messages are end-to-end encrypted',
            );

            // Clicking the row again brings the conversation back, draft and all.
            await _converse.api.chats.open(contact_jid, {}, true);
            await u.waitUntil(() => chatbox.get('hidden') === false);
            await u.waitUntil(() => app.querySelector('.chat-placeholder') === null);
            expect(chatbox.get('draft')).toBe('half a thought');
        }),
    );

    it(
        'hides a groupchat without leaving the room',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async function (_converse) {
            const chatroom = await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');
            const view = await u.waitUntil(() => _converse.chatboxviews.get(muc_jid));
            const form = await u.waitUntil(() => view.querySelector('converse-muc-message-form'));
            expect(form).not.toBe(null);

            view.querySelector('.chat-textarea').focus();
            await mock.pressComposerKey(view, 'Escape');

            await u.waitUntil(() => chatroom.get('hidden') === true);
            // The room is only hidden: it stays entered and keeps its place in the list.
            expect(chatroom.session.get('connection_status')).toBe(converse.ROOMSTATUS.ENTERED);
            expect(_converse.state.chatboxes.get(muc_jid)).toBe(chatroom);
            await u.waitUntil(() => view.isConnected === false);
        }),
    );

    it(
        'leaves the conversation alone when the caret typeahead claims the Escape',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);
            const form = view.querySelector('converse-message-form');
            await form.ensureEditor();

            // An open suggestion menu owns the key, as it does for arrows and Enter.
            form.typeahead.kind = 'emoji';
            form.typeahead.query = 'smi';
            form.typeahead.items = [{ label: ':smile:', glyph: '\u{1F604}' }];

            await mock.pressComposerKey(view, 'Escape', { stopImmediatePropagation: () => {} });

            expect(form.typeahead.items.length).toBe(0);
            expect(view.model.get('hidden')).toBeFalsy();
        }),
    );
});

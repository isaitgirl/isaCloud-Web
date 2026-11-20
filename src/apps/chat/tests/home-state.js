import { describe, it, expect } from 'vitest';
import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const first_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
const second_jid = mock.cur_names[1].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/**
 * The Chat app, once the app switcher has mounted it.
 * @returns {Promise<any>}
 */
async function getChatApp() {
    return u.waitUntil(() => document.querySelector('converse-app-chat'));
}

/** Let the boot-time hide (a callback on the already-resolved fetch promise) run. */
const settleBootHide = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Open both 1:1 chats, the second on top, so the first is left hidden.
 * @param {import('@converse/headless').ConversePrivateGlobal} _converse
 */
async function openTwoChats(_converse) {
    await _converse.api.chats.open(first_jid, {}, true);
    await _converse.api.chats.open(second_jid, {}, true);
    const chatboxes = _converse.state.chatboxes;
    expect(chatboxes.get(first_jid).get('hidden')).toBe(true);
    expect(chatboxes.get(second_jid).get('hidden')).toBe(false);
    return [chatboxes.get(first_jid), chatboxes.get(second_jid)];
}

describe('The home state with no conversation open', function () {
    it(
        'does not bring another conversation forward when one is closed',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { open_last_conversation: false, view_mode: 'fullscreen' },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 2);
                const app = await getChatApp();
                await settleBootHide();
                const [first, second] = await openTwoChats(_converse);

                await second.close();

                // Closing is not about the conversation left behind: nothing else opens.
                expect(first.get('hidden')).toBe(true);
                await u.waitUntil(() => app.querySelector('.chat-placeholder'));
            },
        ),
    );

    it(
        'brings the previous conversation forward when one is closed, by default',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 2);
            const app = await getChatApp();
            const [first, second] = await openTwoChats(_converse);

            await second.close();

            await u.waitUntil(() => first.get('hidden') === false);
            expect(app.querySelector('.chat-placeholder')).toBe(null);
        }),
    );

    it(
        'shows the deployment brand logo on the empty state',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            {
                open_last_conversation: false,
                view_mode: 'fullscreen',
                brand_logo_url: '/brand/logo.png',
                brand_name: 'Example',
            },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 1);
                const app = await getChatApp();
                await settleBootHide();

                await _converse.api.chats.open(first_jid, {}, true);
                const chatbox = _converse.state.chatboxes.get(first_jid);
                await u.waitUntil(() => chatbox.get('hidden') === false);
                app.hideVisibleConversations();

                const placeholder = await u.waitUntil(() => app.querySelector('.chat-placeholder'));
                const logo = await u.waitUntil(() => placeholder.querySelector('converse-logo img'));
                expect(logo.getAttribute('src')).toBe('/brand/logo.png');
                expect(logo.getAttribute('alt')).toBe('Example');
            },
        ),
    );

    it(
        'does not hide a conversation opened after the boot empty-state hide',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { open_last_conversation: false, view_mode: 'fullscreen' },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 1);
                const app = await getChatApp();
                await settleBootHide();

                // A link can open a conversation while the boot hide is still
                // pending, or the hide's second path can run after it. Either way
                // the conversation is the reason the page was opened.
                await _converse.api.chats.open(first_jid, {}, true);
                const chatbox = _converse.state.chatboxes.get(first_jid);
                await u.waitUntil(() => chatbox.get('hidden') === false);

                _converse.api.trigger('chatBoxesFetched');
                await settleBootHide();

                expect(chatbox.get('hidden')).toBe(false);
                expect(app.querySelector('.chat-placeholder')).toBe(null);
            },
        ),
    );

    it(
        'does not hide a conversation opened before a late-mounting app hide',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { open_last_conversation: false, view_mode: 'fullscreen' },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 1);
                await settleBootHide();

                const jid = first_jid;
                _converse.api.trigger('openConversation', { view: 'chat', jid });
                const chatbox = await u.waitUntil(() => _converse.state.chatboxes.get(jid));
                await u.waitUntil(() => chatbox.get('hidden') === false);

                // A late app mount registers the boot hide after the link already
                // opened the conversation. The JID marked by `openConversation`
                // must exempt it.
                const late_app = document.createElement('converse-app-chat');
                document.querySelector('converse-root').append(late_app);
                await new Promise((resolve) => setTimeout(resolve));

                expect(chatbox.get('hidden')).toBe(false);
                late_app.remove();
            },
        ),
    );

    it(
        'hides the restored conversations on request, showing the empty state',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { open_last_conversation: false, view_mode: 'fullscreen' },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 1);
                const app = await getChatApp();
                await settleBootHide();

                await _converse.api.chats.open(first_jid, {}, true);
                const chatbox = _converse.state.chatboxes.get(first_jid);
                await u.waitUntil(() => chatbox.get('hidden') === false);
                expect(app.querySelector('.chat-placeholder')).toBe(null);

                app.hideVisibleConversations();

                await u.waitUntil(() => chatbox.get('hidden') === true);
                // Hiding keeps the box: its draft, messages and place in the list stay.
                expect(_converse.state.chatboxes.get(first_jid)).toBe(chatbox);
                await u.waitUntil(() => app.querySelector('.chat-placeholder'));
            },
        ),
    );
});

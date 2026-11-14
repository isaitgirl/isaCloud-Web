import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

describe('The window of the message list', function () {
    it(
        'follows the newest message when most models draw nothing',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const chat = view.model;
            const content = await u.waitUntil(() => view.querySelector('converse-chat-content'));

            // Reactions to messages that aren't held yet, as the archive brings them back in time.
            // They are models of the chat, but the list draws nothing for them.
            const now = Date.now();
            for (let i = 0; i < 150; i++) {
                await chat.createMessage({
                    type: 'chat',
                    sender: 'them',
                    from: contact_jid,
                    body: 'reaction',
                    message: 'reaction',
                    dangling_reaction: true,
                    id: u.getUniqueId(),
                    msgid: u.getUniqueId(),
                    time: new Date(now - (1000 - i) * 1000).toISOString(),
                });
            }
            expect(chat.messages.length).toBe(150);
            await u.waitUntil(() => content.window_bottom === -1);

            chat.sendMessage({ body: 'the newest message' });
            await u.waitUntil(() => view.querySelectorAll('.chat-msg').length === 1);
            expect(view.querySelector('.chat-msg .chat-msg__text').textContent.trim()).toBe('the newest message');

            chat.sendMessage({ body: 'and another one' });
            await u.waitUntil(() => view.querySelectorAll('.chat-msg').length === 2);
            expect(content.window_bottom).toBe(1);
        }),
    );

    it(
        'keeps drawing new messages after more than a window of them',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const chat = view.model;
            const content = await u.waitUntil(() => view.querySelector('converse-chat-content'));

            const now = Date.now();
            for (let i = 0; i < 130; i++) {
                await chat.createMessage({
                    type: 'chat',
                    sender: 'them',
                    from: contact_jid,
                    body: `older ${i}`,
                    message: `older ${i}`,
                    id: u.getUniqueId(),
                    msgid: u.getUniqueId(),
                    time: new Date(now - (1000 - i) * 1000).toISOString(),
                });
            }
            await u.waitUntil(() => content.window_bottom === 129);

            chat.sendMessage({ body: 'the newest message' });
            await u.waitUntil(() =>
                [...view.querySelectorAll('.chat-msg__text')].some(
                    (el) => el.textContent.trim() === 'the newest message',
                ),
            );
            expect(content.window_bottom).toBe(130);
        }),
    );
});

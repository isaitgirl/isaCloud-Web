import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { stx, u } = converse.env;

describe('The Controlbox', function () {
    it(
        "can be opened by clicking a DOM element with class 'toggle-controlbox'",
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            spyOn(_converse.api, 'trigger').and.callThrough();
            document.querySelector('.toggle-controlbox').click();
            const el = await u.waitUntil(() => document.querySelector('#controlbox'));
            expect(u.isVisible(el)).toBe(true);
        }),
    );

    it(
        "can be closed by clicking a DOM element with class 'close-chatbox-button'",
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await mock.openControlBox(_converse);
            const view = _converse.chatboxviews.get('controlbox');

            spyOn(view, 'close').and.callThrough();
            spyOn(_converse.api, 'trigger').and.callThrough();

            const button = await u.waitUntil(() => view.querySelector('.controlbox-heading__btn.close'));
            button.click();
            expect(view.close).toHaveBeenCalled();
            expect(_converse.api.trigger).toHaveBeenCalledWith('controlBoxClosed', jasmine.any(Object));
        }),
    );

    describe('while reconnecting', function () {
        it(
            'keeps the panel and shows a discreet notice until the connection is back',
            mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
                await mock.openControlBox(_converse);
                const view = _converse.chatboxviews.get('controlbox');
                expect(view.querySelector('.reconnecting-notice')).toBeNull();

                _converse.api.trigger('will-reconnect');
                const notice = await u.waitUntil(() => view.querySelector('.reconnecting-notice'));
                expect(notice.getAttribute('role')).toBe('status');
                expect(notice.getAttribute('aria-live')).toBe('polite');
                expect(notice.textContent).toContain('Reconnect');
                // The panel stays in place, spinner replaced by nothing.
                expect(view.querySelector('converse-user-profile')).not.toBeNull();
                expect(view.querySelector('.controlbox-pane')).not.toBeNull();
                expect(view.querySelector('converse-spinner')).toBeNull();

                _converse.api.trigger('reconnected');
                await u.waitUntil(() => !view.querySelector('.reconnecting-notice'));
                expect(view.querySelector('converse-user-profile')).not.toBeNull();
                expect(view.querySelector('.controlbox-pane')).not.toBeNull();
            }),
        );

        it(
            'returns the notice to hidden when the session is cleared',
            mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
                await mock.openControlBox(_converse);
                const model = _converse.chatboxes.get('controlbox');

                _converse.api.trigger('will-reconnect');
                await u.waitUntil(() => model.get('reconnecting'));

                _converse.api.trigger('clearSession');
                await u.waitUntil(() => !model.get('reconnecting'));
                expect(model.get('connected')).toBe(false);
            }),
        );
    });

    describe('The "Contacts" section', function () {
        it(
            'shows the number of unread mentions received',
            mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
                const { minimize, maximize } = converse.env.u;

                await mock.waitForRoster(_converse, 'all');
                await mock.openControlBox(_converse);

                const sender_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
                await mock.openChatBoxFor(_converse, sender_jid);
                await u.waitUntil(() => _converse.chatboxes.length);
                const chatview = _converse.chatboxviews.get(sender_jid);
                minimize(chatview.model);

                const el = document.querySelector('converse-app-chat');
                expect(el.querySelector('.restore-chat .message-count') === null).toBeTruthy();
                const rosterview = document.querySelector('converse-roster');
                expect(rosterview.querySelector('.msgs-indicator') === null).toBeTruthy();

                let msg = stx`
                    <message from="${sender_jid}"
                             to="${_converse.api.connection.get().jid}"
                             type="chat"
                             id="${u.getUniqueId()}"
                             xmlns="jabber:client">
                        <body>hello</body>
                        <active xmlns="http://jabber.org/protocol/chatstates"/>
                    </message>`;
                _converse.handleMessageStanza(msg);
                await u.waitUntil(() => rosterview.querySelectorAll('.msgs-indicator').length);
                spyOn(chatview.model, 'handleUnreadMessage').and.callThrough();
                await u.waitUntil(() => el.querySelector('.restore-chat .message-count')?.textContent === '1');
                expect(rosterview.querySelector('.msgs-indicator').textContent).toBe('1');

                msg = stx`
                    <message from="${sender_jid}"
                             to="${_converse.api.connection.get().jid}"
                             type="chat"
                             id="${u.getUniqueId()}"
                             xmlns="jabber:client">
                        <body>hello again</body>
                        <active xmlns="http://jabber.org/protocol/chatstates"/>
                    </message>`;
                _converse.handleMessageStanza(msg);
                await u.waitUntil(() => chatview.model.handleUnreadMessage.calls.count());
                await u.waitUntil(() => el.querySelector('.restore-chat .message-count')?.textContent === '2');
                expect(rosterview.querySelector('.msgs-indicator').textContent).toBe('2');
                maximize(chatview.model);
                await u.waitUntil(() => el.querySelector('.restore-chat .message-count') === null);
                await u.waitUntil(() => rosterview.querySelector('.msgs-indicator') === null);
            }),
        );
    });
});

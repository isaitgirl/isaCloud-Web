import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, u } = converse.env;

describe('A direct chat while the connection is coming back', function () {
    it(
        'shows a discreet notice above the composer and keeps the composer enabled',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);
            expect(view.querySelector('.bottom-panel .reconnecting-notice')).toBeNull();

            const connection = _converse.api.connection.get();
            connection.has_connected = true;
            connection.reconnecting = true;
            connection.status = Strophe.Status.RECONNECTING;
            _converse.state.connfeedback.set({ connection_status: Strophe.Status.RECONNECTING });

            const notice = await u.waitUntil(() => view.querySelector('.bottom-panel .reconnecting-notice'));
            expect(notice.getAttribute('role')).toBe('status');
            expect(notice.getAttribute('aria-live')).toBe('polite');
            expect(notice.textContent).toContain('Reconnecting…');
            // The queue of the send phase holds the messages, so the composer stays usable.
            expect(view.querySelector('.chat-textarea').getAttribute('contenteditable')).toBe('true');

            connection.reconnecting = false;
            connection.status = Strophe.Status.CONNECTED;
            _converse.state.connfeedback.set({ connection_status: Strophe.Status.CONNECTED });

            await u.waitUntil(() => !view.querySelector('.bottom-panel .reconnecting-notice'));
        }),
    );
});

import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, u } = converse.env;

/**
 * Opens a chat and drops the connection, clearing the flags as Strophe does.
 * @param {Object} _converse
 */
async function openChatWhileDisconnected(_converse) {
    const { api } = _converse;
    await mock.waitForRoster(_converse, 'current', 1);
    const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
    await mock.openChatBoxFor(_converse, contact_jid);
    const view = _converse.chatboxviews.get(contact_jid);

    const connection = api.connection.get();
    connection.authenticated = false;
    connection.connected = false;
    const reconnect = vi.spyOn(api.connection, 'reconnect').mockResolvedValue(undefined);
    const alert = vi.spyOn(api, 'alert').mockImplementation(() => {});
    const toast = vi.spyOn(api.toast, 'show').mockImplementation(() => {});
    const restore = () => {
        connection.authenticated = true;
        connection.connected = true;
    };
    return { view, reconnect, alert, toast, restore };
}

describe('A message sent without a connection', function () {
    it(
        'stays in the conversation as a failed message that says why, and reconnects',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const { view, reconnect, alert, toast, restore } = await openChatWhileDisconnected(_converse);
            await mock.setComposerText(view, 'Into the void');
            toast.mockClear();
            await mock.pressComposerKey(view, 'Enter');

            const reason = await u.waitUntil(() => view.querySelector('.chat-msg__send-failed-reason'));
            restore();
            expect(reason.textContent).toBe('Your message could not be sent because you are not connected.');
            expect(view.querySelector('.chat-msg__text').textContent).toBe('Into the void');
            // The composer takes focus during the test, and the `focus` listener
            // of the reconnection phase asks for a reconnect too, so only require
            // that a reconnect was attempted, not that it was the only one.
            expect(reconnect).toHaveBeenCalled();
            expect(alert).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith(
                'send-failed-not-connected',
                expect.objectContaining({ 'type': 'warning' }),
            );
        }),
    );

    it(
        'is refused with an alert when it is a command, keeping the text',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const { view, alert, restore } = await openChatWhileDisconnected(_converse);
            const clear_all = vi.spyOn(view.model, 'clearMessages');
            await mock.setComposerText(view, '/clear');
            await mock.pressComposerKey(view, 'Enter');

            await u.waitUntil(() => alert.mock.calls.length > 0);
            restore();
            expect(alert.mock.calls[0][2]).toBe(
                'Sorry, the connection has been lost, and your message could not be sent',
            );
            expect(clear_all).not.toHaveBeenCalled();
            expect(view.querySelector('.chat-msg__send-failed-reason')).toBeNull();
            expect(view.querySelector('converse-message-form').getInputText()).toBe('/clear');
        }),
    );

    it(
        'is kept as a failed message too when the conversation lost the ability to post with the connection',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const { view, alert, restore } = await openChatWhileDisconnected(_converse);
            vi.spyOn(view.model, 'canPostMessages').mockReturnValue(false);
            await mock.setComposerText(view, 'Into the void');
            await mock.pressComposerKey(view, 'Enter');

            const reason = await u.waitUntil(() => view.querySelector('.chat-msg__send-failed-reason'));
            restore();
            expect(reason.textContent).toBe('Your message could not be sent because you are not connected.');
            expect(alert).not.toHaveBeenCalled();
        }),
    );

    it(
        'waits as pending while the connection comes back, then goes out without a failure',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);

            const connection = api.connection.get();
            connection.authenticated = false;
            connection.connected = false;
            connection.status = Strophe.Status.RECONNECTING;

            await mock.setComposerText(view, 'Waiting for the connection');
            await mock.pressComposerKey(view, 'Enter');

            const pending = await u.waitUntil(() => view.querySelector('.chat-msg__send-pending'));
            expect(pending.textContent).toBe('Sending…');
            expect(view.querySelector('.chat-msg__send-failed-reason')).toBeNull();

            connection.authenticated = true;
            connection.connected = true;
            connection.status = Strophe.Status.CONNECTED;
            api.trigger('chatReconnected', view.model);

            await u.waitUntil(() => !view.querySelector('.chat-msg__send-pending'));
            expect(view.querySelector('.chat-msg__send-failed-reason')).toBeNull();
        }),
    );
});

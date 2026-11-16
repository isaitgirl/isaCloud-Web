import converse from '../../../dist/converse-headless.js';
import mock from '../../../tests/mock.js';

const { Strophe, stx, u } = converse.env;

describe('A failed chat send', function () {
    it(
        'is marked as failed when there is no connection, and can be retried once there is',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();
            connection.authenticated = false;
            connection.connected = false;
            const createStanza = vi.spyOn(chat, 'createMessageStanza');

            await expect(chat.sendMessage({ body: 'Into the void' })).rejects.toMatchObject({
                code: 'not-connected',
            });

            const failed = chat.messages.findWhere({ body: 'Into the void' });
            expect(failed.get('send_status')).toBe('failed');
            expect(failed.get('send_error_code')).toBe('not-connected');
            // Nothing to gain from building it: encrypting would need the server too.
            expect(createStanza).not.toHaveBeenCalled();
            expect(send).not.toHaveBeenCalled();

            connection.authenticated = true;
            connection.connected = true;
            await chat.resendFailedMessage(failed);
            expect(send).toHaveBeenCalledTimes(1);
            expect(failed.get('send_status')).toBeUndefined();
        }),
    );

    it(
        'is sent again on reconnection only when it never reached the transport',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();
            connection.authenticated = false;
            connection.connected = false;

            await expect(chat.sendMessage({ body: 'Into the void' })).rejects.toMatchObject({
                code: 'not-connected',
            });
            const unreachable = chat.messages.findWhere({ body: 'Into the void' });
            expect(unreachable.get('send_status')).toBe('failed');
            expect(unreachable.get('send_error_code')).toBe('not-connected');
            expect(send).not.toHaveBeenCalled();

            connection.authenticated = true;
            connection.connected = true;

            // A failure with another reason is left alone: it may have been delivered.
            const build = chat.createMessageStanza.bind(chat);
            vi.spyOn(chat, 'createMessageStanza').mockImplementation(async (message) => {
                if (message.get('body') === 'Refused') {
                    throw Object.assign(new Error('x'), { code: 'send-failed' });
                }
                return build(message);
            });
            await expect(chat.sendMessage({ body: 'Refused' })).rejects.toMatchObject({ code: 'send-failed' });
            const refused = chat.messages.findWhere({ body: 'Refused' });
            expect(refused.get('send_error_code')).toBe('send-failed');
            expect(send).not.toHaveBeenCalled();

            api.trigger('chatReconnected', chat);

            // The failure is cleared before the stanza is built, so wait for the send itself.
            await u.waitUntil(() => send.mock.calls.length === 1);
            expect(unreachable.get('send_status')).toBeUndefined();
            expect(refused.get('send_status')).toBe('failed');
            expect(refused.get('send_error_code')).toBe('send-failed');
        }),
    );

    it(
        'is not sent twice when a retry overlaps with the resend after a reconnection',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();

            const failWhileDisconnected = async (body) => {
                connection.authenticated = false;
                connection.connected = false;
                await expect(chat.sendMessage({ body })).rejects.toMatchObject({ code: 'not-connected' });
                connection.authenticated = true;
                connection.connected = true;
                return chat.messages.findWhere({ body });
            };

            const first = await failWhileDisconnected('First');

            // Retry clicked, then the automatic resend arrives.
            const retry = chat.resendFailedMessage(first);
            const automatic = chat.resumeSendsAfterReconnection();
            await Promise.all([retry, automatic]);
            expect(send).toHaveBeenCalledTimes(1);

            // The real race: the automatic resend is running when Retry is clicked.
            const second = await failWhileDisconnected('Second');
            const running = chat.resumeSendsAfterReconnection();
            const retry_again = chat.resendFailedMessage(second);
            await Promise.all([running, retry_again]);
            expect(send).toHaveBeenCalledTimes(2);
            expect(second.get('send_status')).toBeUndefined();
        }),
    );

    it(
        'is marked as failed when the connection drops while the stanza is built',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();
            const build = chat.createMessageStanza.bind(chat);
            vi.spyOn(chat, 'createMessageStanza').mockImplementation(async (message) => {
                const stanza = await build(message);
                connection.authenticated = false;
                connection.connected = false;
                return stanza;
            });

            await expect(chat.sendMessage({ body: 'Into the void' })).rejects.toMatchObject({
                code: 'not-connected',
            });
            connection.authenticated = true;
            connection.connected = true;

            expect(chat.messages.findWhere({ body: 'Into the void' }).get('send_status')).toBe('failed');
            expect(send).not.toHaveBeenCalled();
        }),
    );

    it(
        'is marked as failed while the stream is connected but not yet authenticated',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();
            connection.authenticated = false;

            await expect(chat.sendMessage({ body: 'Into the void' })).rejects.toMatchObject({
                code: 'not-connected',
            });
            connection.authenticated = true;

            expect(chat.messages.findWhere({ body: 'Into the void' }).get('send_status')).toBe('failed');
            expect(send).not.toHaveBeenCalled();
        }),
    );

    it(
        'rejects with its code and is kept as a failed message, without an alert or a resend',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            // Headless has no UI, so api.alert doesn't exist here. A send that alerts fails the test.
            api.alert = () => {
                throw new Error('Headless code must not alert');
            };
            try {
                spyOn(api, 'send');
                spyOn(chat, 'createMessageStanza').and.callFake(() => {
                    throw Object.assign(new Error('No OMEMO devices'), { code: 'no-omemo-devices' });
                });

                await expect(chat.sendMessage({ body: 'Not delivered' })).rejects.toMatchObject({
                    code: 'no-omemo-devices',
                });

                const failed = chat.messages.findWhere({ send_status: 'failed' });
                expect(failed.get('body')).toBe('Not delivered');
                expect(failed.get('send_error_code')).toBe('no-omemo-devices');
                expect(api.send).not.toHaveBeenCalled();
                expect(chat.get('num_unread')).toBe(0);

                // A retry that fails too keeps its own reason, which is news to the user.
                chat.createMessageStanza.and.callFake(() => {
                    throw Object.assign(new Error('No keys'), { code: 'omemo-key-fetch-failed' });
                });
                await expect(chat.resendFailedMessage(failed)).rejects.toMatchObject({
                    code: 'omemo-key-fetch-failed',
                });
                expect(failed.get('send_status')).toBe('failed');
                expect(failed.get('send_error_code')).toBe('omemo-key-fetch-failed');

                // Retrying is a call the client makes. Once it succeeds, the failure is cleared.
                chat.createMessageStanza.and.resolveTo(stx`<message xmlns="jabber:client"/>`);
                await chat.resendFailedMessage(failed);
                expect(api.send).toHaveBeenCalledTimes(1);
                expect(failed.get('send_status')).toBeUndefined();
                expect(failed.get('send_error_code')).toBeUndefined();

                // A message that didn't fail can't be resent.
                await expect(chat.resendFailedMessage(failed)).rejects.toThrow(
                    'Only a failed message can be sent again',
                );
            } finally {
                delete api.alert;
            }
        }),
    );

    it(
        'stays encrypted when a send without encryption fails, so Retry does not send it in the clear',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            // Only the encrypted attempt can offer a send without encryption, as in production.
            spyOn(chat, 'createMessageStanza').and.callFake((message) => {
                const e = Object.assign(new Error('x'), { code: 'send-failed' });
                if (message.get('is_encrypted')) e.can_send_unencrypted = true;
                throw e;
            });
            await expect(chat.sendMessage({ body: 'fallback', is_encrypted: true })).rejects.toMatchObject({
                code: 'send-failed',
            });

            const failed = chat.messages.findWhere({ send_status: 'failed' });
            failed.save({ plaintext: 'Secret' });
            expect(failed.get('send_can_send_unencrypted')).toBe(true);
            await expect(
                _converse.api.hook('resendFailedMessageUnencrypted', chat, { message: failed, handled: false }),
            ).rejects.toMatchObject({ code: 'send-failed' });

            expect(failed.get('is_encrypted')).toBe(true);
            expect(failed.get('body')).toBe('fallback');
            expect(failed.get('plaintext')).toBe('Secret');
            expect(failed.get('send_status')).toBe('failed');
            expect(failed.get('send_can_send_unencrypted')).toBe(true);
        }),
    );

    it(
        'is not handled when the message cannot be sent without encryption',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            spyOn(chat, 'createMessageStanza').and.rejectWith(Object.assign(new Error('x'), { code: 'send-failed' }));
            await expect(chat.sendMessage({ body: 'No flag' })).rejects.toMatchObject({ code: 'send-failed' });

            const failed = chat.messages.findWhere({ send_status: 'failed' });
            const data = await _converse.api.hook('resendFailedMessageUnencrypted', chat, {
                message: failed,
                handled: false,
            });
            expect(data.handled).toBe(false);
            expect(failed.get('send_status')).toBe('failed');
        }),
    );

    it(
        'keeps the sender of a failed IQ with the failed message, until it is sent again',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const iq = stx`<iq xmlns="jabber:client" type="error" from="capulet.lit"/>`.tree();
            spyOn(chat, 'createMessageStanza').and.rejectWith(
                Object.assign(new Error('x'), { code: 'omemo-remote-server-not-found', iq }),
            );
            await expect(chat.sendMessage({ body: 'Lost' })).rejects.toMatchObject({
                code: 'omemo-remote-server-not-found',
            });

            const failed = chat.messages.findWhere({ send_status: 'failed' });
            expect(failed.get('send_error_from')).toBe('capulet.lit');

            chat.createMessageStanza.and.resolveTo(stx`<message xmlns="jabber:client"/>`);
            spyOn(_converse.api, 'send');
            await chat.resendFailedMessage(failed);
            expect(failed.get('send_error_from')).toBeUndefined();
        }),
    );

    it(
        'can be discarded from the history',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            spyOn(chat, 'createMessageStanza').and.rejectWith(Object.assign(new Error('x'), { code: 'send-failed' }));
            await expect(chat.sendMessage({ body: 'Drop me' })).rejects.toMatchObject({ code: 'send-failed' });

            const failed = chat.messages.findWhere({ send_status: 'failed' });
            chat.discardFailedMessage(failed);
            expect(chat.messages.findWhere({ send_status: 'failed' })).toBeUndefined();
        }),
    );

    it(
        'goes back to the delivered version when it was a correction and is discarded',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const message = await chat.sendMessage({ body: 'As delivered' });
            const origin_id = message.get('origin_id');

            const connection = api.connection.get();
            connection.authenticated = false;
            await expect(chat.sendMessage({ body: 'Never delivered' }, { correcting: message })).rejects.toMatchObject({
                code: 'not-connected',
            });
            connection.authenticated = true;
            expect(message.get('body')).toBe('Never delivered');
            expect(message.get('send_status')).toBe('failed');

            chat.discardFailedMessage(message);
            expect(chat.messages.get(message.get('id'))).toBe(message);
            expect(message.get('body')).toBe('As delivered');
            expect(message.get('origin_id')).toBe(origin_id);
            expect(message.get('edited')).toBeUndefined();
            expect(message.get('older_versions')).toBeUndefined();
            expect(message.get('send_status')).toBeUndefined();
            expect(message.get('before_correction')).toBeUndefined();
        }),
    );

    it(
        'keeps the delivered version to go back to across a second failed correction, and forgets it once sent',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const message = await chat.sendMessage({ body: 'As delivered' });
            const connection = api.connection.get();
            connection.authenticated = false;
            await expect(chat.sendMessage({ body: 'First try' }, { correcting: message })).rejects.toBeDefined();
            await expect(chat.sendMessage({ body: 'Second try' }, { correcting: message })).rejects.toBeDefined();
            connection.authenticated = true;
            expect(message.get('before_correction').body).toBe('As delivered');

            await chat.resendFailedMessage(message);
            expect(message.get('body')).toBe('Second try');
            expect(message.get('before_correction')).toBeUndefined();
        }),
    );

    it(
        'is kept as failed in a groupchat that was marked disconnected, including a finished upload',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async (_converse) => {
            const { api } = _converse;
            const muc = await mock.openAndEnterMUC(_converse, 'lounge@montague.lit', 'romeo');
            const connection = api.connection.get();
            connection.authenticated = false;
            connection.connected = false;
            muc.session.save({ connection_status: converse.ROOMSTATUS.DISCONNECTED });
            expect(muc.canPostMessages()).toBe(false);

            await expect(muc.sendMessage({ body: 'Into the void' })).rejects.toMatchObject({ code: 'not-connected' });
            expect(muc.messages.findWhere({ body: 'Into the void' }).get('send_error_code')).toBe('not-connected');

            const url = 'https://upload.montague.lit/file.png';
            const placeholder = await muc.createMessage({
                body: url,
                oob_url: url,
                upload: 'success',
                type: 'groupchat',
            });
            await muc.onMessageUploadChanged(placeholder);
            connection.authenticated = true;
            connection.connected = true;

            expect(muc.messages.get(placeholder.get('id'))).toBeUndefined();
            const failed = muc.messages.findWhere({ oob_url: url });
            expect(failed.get('send_status')).toBe('failed');
            expect(failed.get('send_error_code')).toBe('not-connected');
        }),
    );

    it(
        'is queued while a reconnection is underway, and sent once the chat reconnects',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const { api } = _converse;
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);

            const send = vi.spyOn(api, 'send');
            const connection = api.connection.get();
            connection.authenticated = false;
            connection.connected = false;
            connection.status = Strophe.Status.RECONNECTING;

            const message = await chat.sendMessage({ body: 'Waiting for the connection' });
            expect(message.get('send_status')).toBe('pending');
            expect(message.get('send_error_code')).toBeUndefined();
            expect(send).not.toHaveBeenCalled();

            connection.authenticated = true;
            connection.connected = true;
            connection.status = Strophe.Status.CONNECTED;
            api.trigger('chatReconnected', chat);

            await u.waitUntil(() => send.mock.calls.length === 1);
            expect(message.get('send_status')).toBeUndefined();
        }),
    );

    it(
        'is failed as not connected when the queue times out, and sent on the next reconnection',
        mock.initConverse(
            converse,
            ['rosterInitialized', 'chatBoxesInitialized'],
            { send_queue_timeout: 20 },
            async (_converse) => {
                const { api } = _converse;
                await mock.waitForRoster(_converse, 'current', 1);
                const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
                await mock.openChatBoxFor(_converse, contact_jid);
                const chat = _converse.chatboxes.get(contact_jid);

                const send = vi.spyOn(api, 'send');
                const connection = api.connection.get();
                connection.authenticated = false;
                connection.connected = false;
                connection.status = Strophe.Status.RECONNECTING;

                const message = await chat.sendMessage({ body: 'Waiting too long' });
                expect(message.get('send_status')).toBe('pending');

                await u.waitUntil(() => message.get('send_status') === 'failed');
                expect(message.get('send_error_code')).toBe('not-connected');
                expect(send).not.toHaveBeenCalled();

                connection.authenticated = true;
                connection.connected = true;
                connection.status = Strophe.Status.CONNECTED;
                api.trigger('chatReconnected', chat);

                await u.waitUntil(() => send.mock.calls.length === 1);
                expect(message.get('send_status')).toBeUndefined();
            },
        ),
    );

    it(
        'does not fail the messages behind a slow one when their queue time runs out during the flush',
        mock.initConverse(
            converse,
            ['rosterInitialized', 'chatBoxesInitialized'],
            { send_queue_timeout: 20 },
            async (_converse) => {
                const { api } = _converse;
                await mock.waitForRoster(_converse, 'current', 1);
                const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
                await mock.openChatBoxFor(_converse, contact_jid);
                const chat = _converse.chatboxes.get(contact_jid);

                const send = vi.spyOn(api, 'send');
                const connection = api.connection.get();
                connection.authenticated = false;
                connection.connected = false;
                connection.status = Strophe.Status.RECONNECTING;

                const first = await chat.sendMessage({ body: 'Slow to build' });
                const second = await chat.sendMessage({ body: 'Waiting behind' });
                expect(first.get('send_status')).toBe('pending');
                expect(second.get('send_status')).toBe('pending');

                // Without the fix, the second one's timer fails it while the flush is
                // busy with the first, so the flush skips it. Keep the resend out of
                // the way, so that it doesn't hide the skipped message.
                vi.spyOn(chat, 'resendFailedMessage').mockResolvedValue(undefined);

                // Building takes longer than the timeout, so it fires during the flush.
                const build = chat.createMessageStanza.bind(chat);
                vi.spyOn(chat, 'createMessageStanza').mockImplementation(async (m) => {
                    await new Promise((resolve) => setTimeout(resolve, 60));
                    return build(m);
                });

                connection.authenticated = true;
                connection.connected = true;
                connection.status = Strophe.Status.CONNECTED;
                api.trigger('chatReconnected', chat);

                await u.waitUntil(() => send.mock.calls.length === 2);
                expect(first.get('send_status')).toBeUndefined();
                expect(second.get('send_status')).toBeUndefined();
            },
        ),
    );

    it(
        'still does nothing when connected to a groupchat that can not take messages',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async (_converse) => {
            const muc = await mock.openAndEnterMUC(_converse, 'lounge@montague.lit', 'romeo');
            vi.spyOn(muc, 'canPostMessages').mockReturnValue(false);
            await expect(muc.sendMessage({ body: 'Refused' })).resolves.toBeUndefined();
            expect(muc.messages.findWhere({ body: 'Refused' })).toBeUndefined();
        }),
    );
});

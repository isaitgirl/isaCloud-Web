import mock from '../tests/mock.js';
import converse from '../dist/converse-headless.js';

const { Strophe, stx, u } = converse.env;

/**
 * Collects the structured diagnostic events emitted by the core.
 * @param {any} _converse
 * @returns {object[]}
 */
function recordDiagnostics(_converse) {
    const events = [];
    _converse.api.listen.on('diagnosticEvent', (data) => events.push(data));
    return events;
}

/**
 * @param {object[]} events
 * @param {string} name
 * @returns {object[]}
 */
function ofType(events, name) {
    return events.filter((e) => e.event === name);
}

/**
 * @param {object[]} events
 * @param {string} name
 * @returns {object|undefined}
 */
function lastOfType(events, name) {
    return ofType(events, name).pop();
}

describe('Connection diagnostics', function () {
    it(
        'reports every connection status change, without credentials',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const connection = _converse.api.connection.get();

            connection.onConnectStatusChanged(Strophe.Status.CONNFAIL, 'host-unknown');

            expect(lastOfType(events, 'connection_status')).toMatchObject({
                status: 'CONNFAIL',
                status_code: Strophe.Status.CONNFAIL,
                condition: 'host-unknown',
            });
            expect(JSON.stringify(events)).not.toContain('secret');
        }),
    );

    it(
        'reports each retry with its attempt number and a snapshot of the retry state',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const connection = _converse.api.connection.get();
            const reconnect = vi.spyOn(connection, 'reconnect').mockResolvedValue(undefined);

            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            try {
                connection.status = Strophe.Status.CONNFAIL;
                connection.requestReconnect();

                expect(lastOfType(events, 'reconnect_requested')).toEqual({
                    event: 'reconnect_requested',
                    explicit: false,
                });
                expect(lastOfType(events, 'reconnect_scheduled')).toEqual({
                    event: 'reconnect_scheduled',
                    attempt: 1,
                    delay_ms: 3000,
                });
                expect(connection.retry_info).toMatchObject({ retries: 1, retry_scheduled: true });

                vi.advanceTimersByTime(3000);
                expect(reconnect).toHaveBeenCalledOnce();

                connection.status = Strophe.Status.CONNFAIL;
                connection.requestReconnect();
                expect(lastOfType(events, 'reconnect_scheduled')).toMatchObject({ attempt: 2, delay_ms: 6000 });
                expect(connection.retry_info).toMatchObject({ retries: 2, retry_scheduled: true });
            } finally {
                vi.useRealTimers();
            }
            connection.status = Strophe.Status.CONNECTED;
        }),
    );

    it(
        'reports why it stopped retrying',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const connection = _converse.api.connection.get();
            const finish = vi.spyOn(connection, 'finishDisconnection').mockResolvedValue(undefined);

            // A failed authentication that can't be retried.
            connection.setDisconnectionCause(Strophe.Status.AUTHFAIL, 'not-authorized', true);
            connection.onDisconnected();
            expect(lastOfType(events, 'give_up')).toEqual({ event: 'give_up', reason: 'authfail' });

            // A connection that was never established.
            connection.setDisconnectionCause();
            connection.has_connected = false;
            connection.reconnecting = true;
            connection.status = Strophe.Status.CONNECTING;
            connection.onDisconnected();
            expect(lastOfType(events, 'give_up')).toEqual({
                event: 'give_up',
                reason: 'initial_connection_failed',
            });

            // A reason that retrying can't fix.
            delete connection.reconnecting;
            connection.has_connected = true;
            connection.setDisconnectionCause(Strophe.Status.CONNFAIL, 'host-unknown', true);
            connection.onDisconnected();
            expect(lastOfType(events, 'give_up')).toEqual({
                event: 'give_up',
                reason: 'unrecoverable:host-unknown',
            });

            expect(finish).toHaveBeenCalledTimes(3);
        }),
    );

    it(
        'reports whether the connection that came up is a reconnection and whether it resumed',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const connection = _converse.api.connection.get();
            vi.spyOn(connection, 'onConnected').mockResolvedValue(undefined);
            vi.spyOn(Object.getPrototypeOf(connection.constructor.prototype), 'onConnected').mockResolvedValue(
                undefined,
            );

            connection.has_connected = false;
            connection.reconnecting = true;
            connection.onConnectStatusChanged(Strophe.Status.CONNECTED);
            expect(lastOfType(events, 'connected')).toEqual({
                event: 'connected',
                reconnected: false,
                resumed: false,
            });

            connection.reconnecting = true;
            connection.onConnectStatusChanged(Strophe.Status.CONNECTED);
            expect(lastOfType(events, 'connected')).toEqual({
                event: 'connected',
                reconnected: true,
                resumed: false,
            });

            vi.spyOn(connection, 'hasResumed').mockReturnValue(true);
            connection.reconnecting = true;
            connection.onConnectStatusChanged(Strophe.Status.ATTACHED);
            expect(lastOfType(events, 'connected')).toEqual({
                event: 'connected',
                reconnected: true,
                resumed: true,
            });
            delete connection.reconnecting;
        }),
    );

    it(
        'reports a WebSocket close through the transport wrapper',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const Connection = _converse.api.connection.get().constructor;
            const onClose = vi.spyOn(Strophe.Websocket.prototype, '_onClose').mockReturnValue(undefined);

            // A WebSocket connection: the wrapper is installed by the constructor.
            const connection = new Connection('wss://montague.lit/xmpp-websocket', {});
            connection._proto._onClose({ code: 1006, reason: 'proxy closed the socket', wasClean: false });

            expect(onClose).toHaveBeenCalledOnce();
            expect(lastOfType(events, 'transport_closed')).toEqual({
                event: 'transport_closed',
                transport: 'websocket',
                code: 1006,
                reason: 'proxy closed the socket',
                was_clean: false,
            });
            expect(lastOfType(events, 'transport_error')).toBeUndefined();
        }),
    );
});

describe('Stream management diagnostics', function () {
    it(
        'reports the condition of a failed stream resumption',
        mock.initConverse(
            converse,
            ['chatBoxesInitialized'],
            {
                auto_login: false,
                enable_smacks: true,
                smacks_max_unacked_stanzas: 2,
                websocket_url: 'ws://montague.lit/ws',
            },
            async (_converse) => {
                await _converse.api.user.login('romeo@montague.lit/orchard', 'secret');
                const failures = [];
                _converse.api.listen.on('streamResumptionFailed', (data) => failures.push(data));
                const { sm } = _converse.api.connection.get();

                // The page adapter hands Strophe a StanzaView, whose `serialized` is XML.
                sm.onFailed(
                    {
                        name: 'failed',
                        attrs: {},
                        serialized:
                            '<failed xmlns="urn:xmpp:sm:3">' +
                            '<item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>' +
                            '</failed>',
                    },
                    true,
                );
                expect(failures[0]).toEqual({ condition: 'item-not-found' });

                // An Element works too.
                sm.onFailed(
                    stx`<failed xmlns="urn:xmpp:sm:3">
                        <policy-violation xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                    </failed>`.tree(),
                    true,
                );
                expect(failures[1]).toEqual({ condition: 'policy-violation' });

                // Nothing readable: the condition is left out.
                sm.onFailed(undefined, true);
                expect(failures[2]).toEqual({});

                // A failed <enable/> is not a resumption failure.
                sm.onFailed(undefined, false);
                expect(failures).toHaveLength(3);
            },
        ),
    );
});

describe('Ping diagnostics', function () {
    it(
        'reports a timeout of the domain ping and the condition of an error response',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            const { api } = _converse;
            vi.spyOn(api.connection, 'reconnect').mockResolvedValue(undefined);
            const sendIQ = vi.spyOn(api, 'sendIQ').mockResolvedValue(null);

            await api.ping();
            expect(lastOfType(events, 'ping_timeout')).toEqual({
                event: 'ping_timeout',
                timeout_ms: 10000,
            });

            // Pinging someone else says nothing about our connection.
            await api.ping('juliet@montague.lit', 5000);
            expect(ofType(events, 'ping_timeout')).toHaveLength(1);

            sendIQ.mockResolvedValue(
                stx`<iq type="error" xmlns="jabber:client">
                    <ping xmlns="urn:xmpp:ping"/>
                    <error type="cancel">
                        <service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                    </error>
                </iq>`.tree(),
            );
            await api.ping();

            expect(lastOfType(events, 'ping_error')).toEqual({
                event: 'ping_error',
                condition: 'service-unavailable',
            });
            expect(JSON.stringify(events)).not.toContain('juliet');
        }),
    );
});

describe('Send diagnostics', function () {
    it(
        'reports a failed send with its code and chat type, never the message text',
        mock.initConverse(converse, ['rosterInitialized', 'chatBoxesInitialized'], {}, async (_converse) => {
            const events = recordDiagnostics(_converse);
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const chat = _converse.chatboxes.get(contact_jid);
            const { api } = _converse;
            const connection = api.connection.get();

            connection.authenticated = false;
            connection.connected = false;
            await expect(chat.sendMessage({ body: 'very secret text' })).rejects.toMatchObject({
                code: 'not-connected',
            });
            expect(lastOfType(events, 'send_failed')).toEqual({
                event: 'send_failed',
                code: 'not-connected',
                chat_type: 'chatbox',
            });
            expect(JSON.stringify(events)).not.toContain('very secret text');

            // An error without a code falls back to 'send-failed'.
            connection.authenticated = true;
            connection.connected = true;
            vi.spyOn(chat, 'createMessageStanza').mockRejectedValue(new Error('refused'));
            await expect(chat.sendMessage({ body: 'another secret' })).rejects.toBeDefined();

            expect(lastOfType(events, 'send_failed')).toEqual({
                event: 'send_failed',
                code: 'send-failed',
                chat_type: 'chatbox',
            });
            expect(JSON.stringify(events)).not.toContain('another secret');
        }),
    );

    it(
        'reports a message that waits for the connection and the timeout of that wait',
        mock.initConverse(
            converse,
            ['rosterInitialized', 'chatBoxesInitialized'],
            { send_queue_timeout: 20 },
            async (_converse) => {
                const events = recordDiagnostics(_converse);
                await mock.waitForRoster(_converse, 'current', 1);
                const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
                await mock.openChatBoxFor(_converse, contact_jid);
                const chat = _converse.chatboxes.get(contact_jid);
                const connection = _converse.api.connection.get();

                connection.authenticated = false;
                connection.connected = false;
                connection.status = Strophe.Status.RECONNECTING;

                const message = await chat.sendMessage({ body: 'waiting too long' });
                expect(lastOfType(events, 'send_queued')).toEqual({
                    event: 'send_queued',
                    chat_type: 'chatbox',
                    timeout_ms: 20,
                });

                await u.waitUntil(() => message.get('send_status') === 'failed');
                expect(lastOfType(events, 'send_queue_timeout')).toEqual({
                    event: 'send_queue_timeout',
                    chat_type: 'chatbox',
                });
                expect(JSON.stringify(events)).not.toContain('waiting too long');

                connection.authenticated = true;
                connection.connected = true;
                connection.status = Strophe.Status.CONNECTED;
            },
        ),
    );
});

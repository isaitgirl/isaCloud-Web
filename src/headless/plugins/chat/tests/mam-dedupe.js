import mock from '../../../tests/mock.js';
import converse from '../../../dist/converse-headless.js';

const { Strophe, sizzle, stx, u } = converse.env;

/**
 * Answers the chat's pending MAM query with the passed in archived messages,
 * and resolves once the chat has processed all of them.
 * @param {import('../../chat/model').default} chat
 * @param {Object} _converse
 * @param {{ archive_id?: string, inner: string }[]} messages
 */
async function replayMAM(chat, _converse, messages) {
    const conn = _converse.api.connection.get();
    const iq = await u.waitUntil(() =>
        conn.IQ_stanzas.filter((iq) => sizzle(`query[xmlns="${Strophe.NS.MAM}"]`, iq).length).pop(),
    );
    const query_id = iq.querySelector('query').getAttribute('queryid');

    const chains = [];
    const queue_message = chat.queueMessage.bind(chat);
    chat.queueMessage = (attrs) => {
        const promise = queue_message(attrs);
        chains.push(promise);
        return promise;
    };

    messages.forEach(({ archive_id = u.getUniqueId(), inner }) => {
        conn._dataRecv(
            mock.createRequest(
                _converse,
                stx`<message xmlns="jabber:client" from="${_converse.bare_jid}" to="${conn.jid}">
                    <result xmlns="${Strophe.NS.MAM}" queryid="${query_id}" id="${archive_id}">
                        <forwarded xmlns="urn:xmpp:forward:0">
                            <delay xmlns="urn:xmpp:delay" stamp="2026-11-01T10:00:00Z"/>
                            ${inner}
                        </forwarded>
                    </result>
                </message>`,
            ),
        );
    });
    conn._dataRecv(
        mock.createRequest(
            _converse,
            stx`<iq xmlns="jabber:client" type="result" to="${conn.jid}" id="${iq.getAttribute('id')}">
                <fin xmlns="${Strophe.NS.MAM}" complete="true"/>
            </iq>`,
        ),
    );

    await u.waitUntil(() => chains.length === messages.length);
    await Promise.all(chains);
    chat.queueMessage = queue_message;
}

/**
 * Opens a chat with the first contact of the roster and returns it.
 * @param {Object} _converse
 * @returns {Promise<import('../../chat/model').default>}
 */
async function openChat(_converse) {
    await mock.waitForRoster(_converse, 'current');
    await mock.waitUntilDiscoConfirmed(_converse, _converse.bare_jid, null, [Strophe.NS.MAM]);
    const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
    const chat = await _converse.api.chats.get(contact_jid, {}, true);
    await chat.messages.fetched;
    return chat;
}

describe('A MAM replay of one of our own messages', function () {
    it(
        'is deduplicated when it only carries the client-assigned id',
        mock.initConverse(converse, ['discoInitialized'], {}, async function (_converse) {
            const chat = await openChat(_converse);

            await chat.sendMessage({ body: 'Hello world' });
            await u.waitUntil(() => chat.messages.length === 1);
            const own = chat.messages.at(0);

            await replayMAM(chat, _converse, [
                {
                    'archive_id': 'archive-1',
                    // The archive rewrote `from` to our bare JID, unlike our local copy.
                    'inner': stx`<message xmlns="jabber:client" from="${_converse.bare_jid}" to="${chat.get('jid')}" type="chat" id="${own.get('msgid')}">
                        <body>Hello world</body>
                    </message>`,
                },
            ]);

            expect(chat.messages.length).toBe(1);
        }),
    );

    it(
        'is deduplicated when it carries a stanza-id',
        mock.initConverse(converse, ['discoInitialized'], {}, async function (_converse) {
            const chat = await openChat(_converse);

            await chat.sendMessage({ body: 'Hello world' });
            await u.waitUntil(() => chat.messages.length === 1);
            const own = chat.messages.at(0);

            await replayMAM(chat, _converse, [
                {
                    'archive_id': 'archive-1',
                    'inner': stx`<message xmlns="jabber:client" from="${_converse.bare_jid}" to="${chat.get('jid')}" type="chat" id="${own.get('msgid')}">
                        <body>Hello world</body>
                        <origin-id xmlns="${Strophe.NS.SID}" id="${own.get('origin_id')}"/>
                        <stanza-id xmlns="${Strophe.NS.SID}" by="${_converse.bare_jid}" id="server-id"/>
                    </message>`,
                },
            ]);

            expect(chat.messages.length).toBe(1);
            expect(chat.messages.at(0).get('origin_id')).toBe(own.get('origin_id'));
        }),
    );
});

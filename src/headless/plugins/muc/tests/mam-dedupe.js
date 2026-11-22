import mock from '../../../tests/mock.js';
import converse from '../../../dist/converse-headless.js';

const { Strophe, sizzle, stx, u } = converse.env;

const NS_FLUUX_POLL = 'urn:fluux:poll:0';

/**
 * Answers the room's pending MAM query with the passed in archived messages,
 * and resolves once the room has processed all of them.
 * @param {import('../../muc/muc').default} model
 * @param {Object} _converse
 * @param {{ archive_id?: string, inner: string }[]} messages
 */
async function replayMAM(model, _converse, messages) {
    const muc_jid = model.get('jid');
    const conn = _converse.api.connection.get();
    const iq = await u.waitUntil(() =>
        conn.IQ_stanzas.filter(
            (iq) => iq.getAttribute('to') === muc_jid && sizzle(`query[xmlns="${Strophe.NS.MAM}"]`, iq).length,
        ).pop(),
    );
    const query_id = iq.querySelector('query').getAttribute('queryid');

    const chains = [];
    const queue_message = model.queueMessage.bind(model);
    model.queueMessage = (attrs) => {
        const promise = queue_message(attrs);
        chains.push(promise);
        return promise;
    };

    messages.forEach(({ archive_id = u.getUniqueId(), inner }) => {
        conn._dataRecv(
            mock.createRequest(
                _converse,
                stx`<message xmlns="jabber:client" from="${muc_jid}" to="${_converse.bare_jid}">
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
    model.queueMessage = queue_message;
}

describe('A MAM replay of our own MUC message', function () {
    it(
        'is deduplicated when it only carries the client-assigned id',
        mock.initConverse(converse, [], {}, async function (_converse) {
            const model = await mock.openAndEnterMUC(_converse, 'room@muc.example.com', 'romeo');

            const body = '📊 Poll: Almoço?';
            await model.sendMessage({ body });
            await u.waitUntil(() => model.messages.length === 1);
            const own = model.messages.at(0);

            await replayMAM(model, _converse, [
                {
                    'archive_id': 'archive-1',
                    'inner': stx`<message xmlns="jabber:client" from="${model.get('jid')}/romeo" to="${_converse.bare_jid}" type="groupchat" id="${own.get('msgid')}">
                        <body>${body}</body>
                        <fallback xmlns="${Strophe.NS.FALLBACK}" for="${NS_FLUUX_POLL}"><body/></fallback>
                    </message>`,
                },
            ]);

            expect(model.messages.length).toBe(1);
        }),
    );

    it(
        'is deduplicated when it carries a stanza-id',
        mock.initConverse(converse, [], {}, async function (_converse) {
            const muc_jid = 'room@muc.example.com';
            const model = await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');

            await model.sendMessage({ body: 'Hello world' });
            await u.waitUntil(() => model.messages.length === 1);
            const own = model.messages.at(0);

            await replayMAM(model, _converse, [
                {
                    'archive_id': 'archive-1',
                    'inner': stx`<message xmlns="jabber:client" from="${muc_jid}/romeo" to="${_converse.bare_jid}" type="groupchat" id="${own.get('msgid')}">
                        <body>Hello world</body>
                        <origin-id xmlns="${Strophe.NS.SID}" id="${own.get('origin_id')}"/>
                        <stanza-id xmlns="${Strophe.NS.SID}" by="${muc_jid}" id="server-id"/>
                    </message>`,
                },
            ]);

            expect(model.messages.length).toBe(1);
            expect(model.messages.at(0).get('origin_id')).toBe(own.get('origin_id'));
            // The archive's own id takes precedence over the room's stanza-id,
            // so that paging can find the message by its archive id.
            expect(model.messages.at(0).get(`stanza_id ${muc_jid}`)).toBe('archive-1');
        }),
    );

    it(
        "doesn't merge another occupant's message that reuses our client id",
        mock.initConverse(converse, [], {}, async function (_converse) {
            const muc_jid = 'room@muc.example.com';
            const model = await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');

            await model.sendMessage({ body: 'Ours' });
            await u.waitUntil(() => model.messages.length === 1);
            const own = model.messages.at(0);

            await replayMAM(model, _converse, [
                {
                    'archive_id': 'archive-1',
                    'inner': stx`<message xmlns="jabber:client" from="${muc_jid}/juliet" to="${_converse.bare_jid}" type="groupchat" id="${own.get('msgid')}">
                        <body>Theirs</body>
                    </message>`,
                },
            ]);

            expect(model.messages.length).toBe(2);
            expect(model.messages.findWhere({ body: 'Theirs' })).toBeTruthy();
        }),
    );
});

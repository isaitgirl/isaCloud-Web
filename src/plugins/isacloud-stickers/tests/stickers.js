import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, sizzle, stx, u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };
const NS_STICKERS = 'urn:xmpp:stickers:0';

/**
 * Returns the rendered `converse-chat-message` element whose body is `body`.
 * The message class (`chat-msg--sticker`) is on its inner `article.chat-msg`.
 * @param {Element} view
 * @param {string} body
 */
const findMessageEl = (view, body) =>
    Array.from(view.querySelectorAll('converse-chat-message')).find((el) => el.model.get('body') === body);

describe('An isaCloud sticker', function () {
    it(
        'sent in a 1:1 chat is marked and shown without the message frame',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const url = 'https://upload.example.org/sticker-1.png';
            const stanza = stx`
                <message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                    <body>${url}</body>
                    <x xmlns="jabber:x:oob"><url>${url}</url></x>
                    <sticker xmlns="${NS_STICKERS}"/>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBe(true);
            await u.waitUntil(() => el.querySelector('article.chat-msg'));
            expect(el.querySelector('article.chat-msg.chat-msg--sticker')).not.toBeNull();
        }),
    );

    it(
        'is not added to a plain image message',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const url = 'https://upload.example.org/photo-1.png';
            const stanza = stx`
                <message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                    <body>${url}</body>
                    <x xmlns="jabber:x:oob"><url>${url}</url></x>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBeUndefined();
            await u.waitUntil(() => el.querySelector('article.chat-msg'));
            expect(el.querySelector('.chat-msg--sticker')).toBeNull();
        }),
    );

    it(
        'sent from another of our devices (carbon) is marked',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const recipient_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, recipient_jid);
            const url = 'https://upload.example.org/carbon-sticker.png';
            const stanza = stx`
                <message from="${_converse.bare_jid}" id="${u.getUniqueId()}" to="${_converse.jid}" type="chat" xmlns="jabber:client">
                    <sent xmlns="urn:xmpp:carbons:2">
                        <forwarded xmlns="urn:xmpp:forward:0">
                            <message xmlns="jabber:client" from="${_converse.bare_jid}/another-resource" to="${recipient_jid}" type="chat">
                                <body>${url}</body>
                                <x xmlns="jabber:x:oob"><url>${url}</url></x>
                                <sticker xmlns="${NS_STICKERS}"/>
                            </message>
                        </forwarded>
                    </sent>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBe(true);
            await u.waitUntil(() => el.querySelector('article.chat-msg'));
            expect(el.querySelector('article.chat-msg.chat-msg--sticker')).not.toBeNull();
        }),
    );

    it(
        'in a groupchat is marked',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const muc_jid = 'lounge@montague.lit';
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');
            const view = _converse.chatboxviews.get(muc_jid);
            const nick = mock.chatroom_names[0];
            const url = 'https://upload.example.org/muc-sticker.png';
            const stanza = stx`
                <message xmlns="jabber:client" type="groupchat" id="${u.getUniqueId()}" from="${muc_jid}/${nick}" to="${_converse.jid}">
                    <body>${url}</body>
                    <x xmlns="jabber:x:oob"><url>${url}</url></x>
                    <sticker xmlns="${NS_STICKERS}"/>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBe(true);
            await u.waitUntil(() => el.querySelector('article.chat-msg'));
            expect(el.querySelector('article.chat-msg.chat-msg--sticker')).not.toBeNull();
        }),
    );

    it(
        'in a groupchat archive (MAM) result is marked',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const muc_jid = 'lounge@montague.lit';
            const nick = 'romeo';
            const sent_IQs = _converse.api.connection.get().IQ_stanzas;
            await mock.openAndEnterMUC(_converse, muc_jid, nick, [], []);
            const view = _converse.chatboxviews.get(muc_jid);
            const iq_get = await u.waitUntil(() =>
                sent_IQs.filter((iq) => sizzle(`query[xmlns="${Strophe.NS.MAM}"]`, iq).length).pop(),
            );
            const queryid = iq_get.querySelector('query').getAttribute('queryid');
            const url = 'https://upload.example.org/mam-sticker.png';
            const result = stx`
                <message xmlns="jabber:client" to="${_converse.jid}" from="${muc_jid}">
                    <result xmlns="urn:xmpp:mam:2" queryid="${queryid}" id="${u.getUniqueId()}">
                        <forwarded xmlns="urn:xmpp:forward:0">
                            <delay xmlns="urn:xmpp:delay" stamp="2026-11-13T10:00:00Z"/>
                            <message xmlns="jabber:client" type="groupchat" id="${u.getUniqueId()}" from="${muc_jid}/${mock.chatroom_names[0]}">
                                <body>${url}</body>
                                <x xmlns="jabber:x:oob"><url>${url}</url></x>
                                <sticker xmlns="${NS_STICKERS}"/>
                            </message>
                        </forwarded>
                    </result>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, result));
            const fin = stx`
                <iq type="result" id="${iq_get.getAttribute('id')}" xmlns="jabber:client">
                    <fin xmlns="urn:xmpp:mam:2" complete="true">
                        <set xmlns="http://jabber.org/protocol/rsm">
                            <first index="0">${u.getUniqueId()}</first>
                            <last>${u.getUniqueId()}</last>
                            <count>1</count>
                        </set>
                    </fin>
                </iq>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, fin));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBe(true);
            await u.waitUntil(() => el.querySelector('article.chat-msg.chat-msg--sticker'));
        }),
    );

    it(
        'is not marked when the sticker element is not a direct child of the message',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const url = 'https://upload.example.org/nested-sticker.png';
            const stanza = stx`
                <message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                    <body>${url}</body>
                    <x xmlns="jabber:x:oob"><url>${url}</url></x>
                    <x xmlns="urn:example:other"><sticker xmlns="${NS_STICKERS}"/></x>
                </message>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));

            const el = await u.waitUntil(() => findMessageEl(view, url));
            expect(el.model.get('isacloud_sticker')).toBeUndefined();
            await u.waitUntil(() => el.querySelector('article.chat-msg'));
            expect(el.querySelector('.chat-msg--sticker')).toBeNull();
        }),
    );

    it('keeps the message class wrapper on the chat message element', function () {
        // Guard: the plugin wraps this method because there is no hook for it.
        // If upstream renames it, this fails and the wrapper must be updated.
        expect(typeof customElements.get('converse-chat-message').prototype.getExtraMessageClasses).toBe('function');
    });
});

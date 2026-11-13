import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, sizzle, u, stx } = converse.env;

describe('The "Groupchats" List modal', function () {
    it(
        'can be opened from a link in the "Groupchats" section of the controlbox',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            const button = await u.waitUntil(() => cbview.querySelector('converse-rooms-list .show-list-muc-modal'));
            button.click();
            mock.closeControlBox(_converse);
            const modal = _converse.api.modal.get('converse-muc-list-modal');
            await u.waitUntil(() => u.isVisible(modal), 1000);
            spyOn(_converse.ChatRoom.prototype, 'getDiscoInfo').and.callFake(() => Promise.resolve());

            // See: https://xmpp.org/extensions/xep-0045.html#disco-rooms
            expect(modal.querySelectorAll('.available-chatrooms li').length).toBe(0);

            const server_input = modal.querySelector('input[name="server"]');
            expect(server_input.placeholder).toBe('conference.example.org');
            server_input.value = 'chat.shakespeare.lit';
            modal.querySelector('input[type="submit"]').click();
            await u.waitUntil(() => _converse.chatboxes.length);

            const IQ_stanzas = _converse.api.connection.get().IQ_stanzas;
            const sent_stanza = await u.waitUntil(() =>
                IQ_stanzas.filter((s) => sizzle(`query[xmlns="${Strophe.NS.DISCO_ITEMS}"]`, s).length).pop(),
            );
            const id = sent_stanza.getAttribute('id');
            expect(sent_stanza)
                .toEqualStanza(stx`<iq from="romeo@montague.lit/orchard" id="${id}" to="chat.shakespeare.lit" type="get" xmlns="jabber:client">
                <query xmlns="http://jabber.org/protocol/disco#items"/>
            </iq>`);

            const iq = stx`
                <iq from="muc.montague.lit"
                        to="romeo@montague.lit/pda"
                        id="${id}"
                        type="result"
                        xmlns="jabber:client">
                    <query>
                        <item jid="heath@chat.shakespeare.lit" name="A Lonely Heath"/>
                        <item jid="coven@chat.shakespeare.lit" name="A Dark Cave"/>
                        <item jid="forres@chat.shakespeare.lit" name="The Palace"/>
                        <item jid="inverness@chat.shakespeare.lit" name="Macbeth&apos;s Castle"/>
                        <item jid="orchard@chat.shakespeare.lit" name="Capulet's Orchard"/>
                        <item jid="friar@chat.shakespeare.lit" name="Friar Laurence's cell"/>
                        <item jid="hall@chat.shakespeare.lit" name="Hall in Capulet's house"/>
                        <item jid="chamber@chat.shakespeare.lit" name="Juliet's chamber"/>
                        <item jid="public@chat.shakespeare.lit" name="A public place"/>
                        <item jid="street@chat.shakespeare.lit" name="A street"/>
                    </query>
                </iq>`;
            _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, iq));

            await u.waitUntil(() => modal.querySelectorAll('.available-chatrooms li').length === 11);
            const rooms = modal.querySelectorAll('.available-chatrooms li');
            expect(rooms[0].textContent.trim()).toBe('Groupchats found');
            expect(rooms[1].textContent.trim()).toBe('A Lonely Heath');
            expect(rooms[2].textContent.trim()).toBe('A Dark Cave');
            expect(rooms[3].textContent.trim()).toBe('The Palace');
            expect(rooms[4].textContent.trim()).toBe("Macbeth's Castle");
            expect(rooms[5].textContent.trim()).toBe("Capulet's Orchard");
            expect(rooms[6].textContent.trim()).toBe("Friar Laurence's cell");
            expect(rooms[7].textContent.trim()).toBe("Hall in Capulet's house");
            expect(rooms[8].textContent.trim()).toBe("Juliet's chamber");
            expect(rooms[9].textContent.trim()).toBe('A public place');
            expect(rooms[10].textContent.trim()).toBe('A street');

            rooms[4].querySelector('.open-room').click();

            await mock.waitForMUCDiscoInfo(_converse, 'inverness@chat.shakespeare.lit');
            await mock.waitForReservedNick(_converse, 'inverness@chat.shakespeare.lit', 'romeo');
            await u.waitUntil(() => _converse.chatboxes.length > 1);

            expect(sizzle('.chatroom', _converse.el).filter(u.isVisible).length).toBe(1); // There should now be an open chatroom
            const view = _converse.chatboxviews.get('inverness@chat.shakespeare.lit');
            expect(view.querySelector('.chatbox-title__text').textContent.trim()).toBe("Macbeth's Castle");
        }),
    );

    it(
        'is pre-filled with the muc_domain',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { 'muc_domain': 'muc.example.org' },
            async function (_converse) {
                await mock.openControlBox(_converse);
                const cbview = _converse.chatboxviews.get('controlbox');
                const button = await u.waitUntil(() =>
                    cbview.querySelector('converse-rooms-list .show-list-muc-modal'),
                );
                button.click();
                mock.closeControlBox(_converse);
                const modal = _converse.api.modal.get('converse-muc-list-modal');
                await u.waitUntil(() => u.isVisible(modal), 1000);
                const server_input = modal.querySelector('input[name="server"]');
                expect(server_input.value).toBe('muc.example.org');
            },
        ),
    );

    it(
        "doesn't let you set the MUC domain if it's locked",
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { 'muc_domain': 'chat.shakespeare.lit', 'locked_muc_domain': true },
            async function (_converse) {
                await mock.openControlBox(_converse);
                const cbview = _converse.chatboxviews.get('controlbox');
                const button = await u.waitUntil(() =>
                    cbview.querySelector('converse-rooms-list .show-list-muc-modal'),
                );
                button.click();
                mock.closeControlBox(_converse);
                const modal = _converse.api.modal.get('converse-muc-list-modal');
                await u.waitUntil(() => u.isVisible(modal), 1000);
                spyOn(_converse.ChatRoom.prototype, 'getDiscoInfo').and.callFake(() => Promise.resolve());

                expect(modal.querySelector('input[name="server"]')).toBe(null);
                expect(modal.querySelector('input[type="submit"]')).toBe(null);
                await u.waitUntil(() => _converse.chatboxes.length);
                const sent_stanza = await u.waitUntil(() =>
                    _converse.api.connection
                        .get()
                        .sent_stanzas.filter(
                            (s) => sizzle(`query[xmlns="http://jabber.org/protocol/disco#items"]`, s).length,
                        )
                        .pop(),
                );
                expect(sent_stanza)
                    .toEqualStanza(stx`<iq from="romeo@montague.lit/orchard" id="${sent_stanza.getAttribute('id')}" to="chat.shakespeare.lit" type="get" xmlns="jabber:client">
                    <query xmlns="http://jabber.org/protocol/disco#items"/>
                </iq>`);
                const iq = stx`
                    <iq from="muc.montague.lit"
                        to="romeo@montague.lit/pda"
                        id="${sent_stanza.getAttribute('id')}"
                        type="result"
                        xmlns="jabber:client">
                        <query>
                            <item jid="heath@chat.shakespeare.lit" name="A Lonely Heath"/>
                            <item jid="coven@chat.shakespeare.lit" name="A Dark Cave"/>
                            <item jid="forres@chat.shakespeare.lit" name="The Palace"/>
                        </query>
                    </iq>`;
                _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, iq));

                await u.waitUntil(() => modal.querySelectorAll('.available-chatrooms li').length === 4);
                const rooms = modal.querySelectorAll('.available-chatrooms li');
                expect(rooms[0].textContent.trim()).toBe('Groupchats found');
                expect(rooms[1].textContent.trim()).toBe('A Lonely Heath');
                expect(rooms[2].textContent.trim()).toBe('A Dark Cave');
                expect(rooms[3].textContent.trim()).toBe('The Palace');
            },
        ),
    );

    it(
        'lists the groupchats of every service, sorted, with muc_list_all_services',
        mock.initConverse(converse, ['chatBoxesFetched'], { muc_list_all_services: true }, async function (_converse) {
            vi.spyOn(u.muc, 'getMUCServices').mockResolvedValue(['b.shakespeare.lit', 'a.shakespeare.lit']);
            spyOn(_converse.ChatRoom.prototype, 'getDiscoInfo').and.callFake(() => Promise.resolve());
            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            const button = await u.waitUntil(() => cbview.querySelector('converse-rooms-list .show-list-muc-modal'));
            button.click();
            const modal = _converse.api.modal.get('converse-muc-list-modal');
            await u.waitUntil(() => u.isVisible(modal), 1000);

            const IQ_stanzas = _converse.api.connection.get().IQ_stanzas;
            const query = (service) =>
                u.waitUntil(() =>
                    IQ_stanzas.find(
                        (s) =>
                            s.getAttribute('to') === service &&
                            sizzle(`query[xmlns="${Strophe.NS.DISCO_ITEMS}"]`, s).length,
                    ),
                );
            const reply = (iq, items) =>
                _converse.api.connection.get()._dataRecv(
                    mock.createRequest(
                        _converse,
                        stx`<iq xmlns="jabber:client" type="result" id="${iq.getAttribute('id')}" from="${iq.getAttribute('to')}" to="${_converse.jid}">
                            <query xmlns="${Strophe.NS.DISCO_ITEMS}">
                                ${items.map(([jid, name]) => stx`<item jid="${jid}" name="${name}"/>`)}
                            </query>
                        </iq>`,
                    ),
                );
            reply(await query('b.shakespeare.lit'), [
                ['zeta@b.shakespeare.lit', 'Zeta'],
                ['beta@b.shakespeare.lit', 'beta'],
            ]);
            reply(await query('a.shakespeare.lit'), [['alfa@a.shakespeare.lit', 'Alfa']]);

            await u.waitUntil(() => modal.querySelectorAll('.available-chatrooms .room-item').length === 3);
            const names = Array.from(modal.querySelectorAll('.available-room__name')).map((el) =>
                el.textContent.trim(),
            );
            expect(names).toEqual(['Alfa', 'beta', 'Zeta']);
            const services = Array.from(modal.querySelectorAll('.available-room__service')).map((el) =>
                el.textContent.trim(),
            );
            expect(services).toEqual(['a.shakespeare.lit', 'b.shakespeare.lit', 'b.shakespeare.lit']);

            // No server field: every service is already listed.
            expect(modal.querySelector('form.list-chatrooms')).toBe(null);
            expect(modal.querySelector('.modal-title').textContent.trim()).toBe('Search channels');
            expect(modal.querySelector('.available-chatrooms .active').textContent.trim()).toBe('Channels found');

            // The info button shows the details of the room.
            modal.querySelector('a.room-info').click();
            await u.waitUntil(() => modal.querySelector('.room-info__spinner'));
            const info_iq = await u.waitUntil(() =>
                IQ_stanzas.find(
                    (s) =>
                        s.getAttribute('to') === 'alfa@a.shakespeare.lit' &&
                        sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, s).length,
                ),
            );
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<iq xmlns="jabber:client" type="result" id="${info_iq.getAttribute('id')}" from="alfa@a.shakespeare.lit" to="${_converse.jid}">
                        <query xmlns="${Strophe.NS.DISCO_INFO}">
                            <identity category="conference" name="Alfa" type="text"/>
                            <feature var="muc_open"/>
                        </query>
                    </iq>`,
                ),
            );
            const details = await u.waitUntil(() => modal.querySelector('div.room-info'));
            expect(details.textContent).toContain('Channel address: alfa@a.shakespeare.lit');
            expect(modal.querySelector('.room-info__spinner')).toBe(null);
            expect(modal.querySelector('a.room-info').classList.contains('selected')).toBe(true);

            // The name is not a link; the join button opens the room.
            expect(modal.querySelector('.available-room a')).toBe(null);
            const trigger = vi.spyOn(_converse.api, 'trigger');
            modal.querySelectorAll('.available-room__join')[0].click();
            expect(trigger).toHaveBeenCalledWith('openConversation', {
                view: 'room',
                jid: 'alfa@a.shakespeare.lit',
                attrs: { name: 'Alfa' },
            });
        }),
    );
});

import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

describe('The list of MUC domains', function () {
    it(
        'is shown in controlbox',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            {
                muc_grouped_by_domain: true,
                allow_bookmarks: false, // Makes testing easier, otherwise we
                // have to mock stanza traffic.
            },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 0);
                await mock.openControlBox(_converse);
                const controlbox = _converse.chatboxviews.get('controlbox');
                let list = controlbox.querySelector('.list-container--openrooms');
                expect(u.hasClass('hidden', list)).toBeTruthy();

                let muc_jid = 'room@conference.shakespeare.lit';
                _converse.api.rooms.open(muc_jid, { nick: 'JC' });
                await mock.waitForMUCDiscoInfo(_converse, muc_jid);

                const lview = controlbox.querySelector('converse-rooms-list');
                // Check that the group is shown
                await u.waitUntil(() => lview.querySelectorAll('.muc-domain-group').length);
                let group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(1);
                // .children[0] should give the a tag with the domain in it
                // there might be a more robust way to do this
                // (select for ".muc-domain-group-toggle"?)
                // .trim() because there is a space for the arrow/triangle icon first
                expect(group_els[0].children[0].innerText.trim()).toBe('conference.shakespeare.lit');
                // Check that the room is shown
                await u.waitUntil(() => lview.querySelectorAll('.open-room').length);
                let room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(1);
                expect(room_els[0].querySelector('span').innerText).toBe('Room');

                // Check that a second room in the same domain is shown in the same
                // domain group.
                muc_jid = 'secondroom@conference.shakespeare.lit';
                _converse.api.rooms.open(muc_jid, { nick: 'JC' });
                await mock.waitForMUCDiscoInfo(_converse, muc_jid);

                await u.waitUntil(() => lview.querySelectorAll('.open-room').length > 1);
                group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(1); // still only one group
                expect(group_els[0].children[0].innerText.trim()).toBe('conference.shakespeare.lit');
                room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(2); // but two rooms inside it

                muc_jid = 'lounge@montague.lit';
                _converse.api.rooms.open(muc_jid, { nick: 'romeo' });
                await mock.waitForMUCDiscoInfo(_converse, muc_jid);

                await u.waitUntil(() => lview.querySelectorAll('.open-room').length > 2);
                room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(3);
                group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(2);

                let view = _converse.chatboxviews.get('room@conference.shakespeare.lit');
                await view.close();
                room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(2);
                group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(2);
                view = _converse.chatboxviews.get('secondroom@conference.shakespeare.lit');
                await view.close();
                room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(1);
                group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(1);
                expect(room_els[0].querySelector('span').innerText).toBe('Lounge');
                expect(group_els[0].children[0].innerText.trim()).toBe('montague.lit');
                list = controlbox.querySelector('.list-container--openrooms');
                u.waitUntil(() => Array.from(list.classList).includes('hidden'));

                view = _converse.chatboxviews.get('lounge@montague.lit');
                await view.close();
                room_els = lview.querySelectorAll('.open-room');
                expect(room_els.length).toBe(0);
                group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(0);

                list = controlbox.querySelector('.list-container--openrooms');
                expect(Array.from(list.classList).includes('hidden')).toBeTruthy();
            },
        ),
    );
});

describe('A MUC domain group', function () {
    it(
        'is collapsible',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            {
                muc_grouped_by_domain: true,
                allow_bookmarks: false, // Makes testing easier, otherwise we
                // have to mock stanza traffic.
            },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 0);
                await mock.openControlBox(_converse);
                const controlbox = _converse.chatboxviews.get('controlbox');
                const list = controlbox.querySelector('converse-rooms-list .list-container--openrooms');
                const nick = 'JC';
                const muc_jid = 'room@conference.shakespeare.lit';
                _converse.api.rooms.open(muc_jid, { nick });
                await mock.waitForMUCDiscoInfo(_converse, muc_jid);

                const lview = controlbox.querySelector('converse-rooms-list');
                await u.waitUntil(() => lview.querySelectorAll('.muc-domain-group').length);
                expect(u.hasClass('hidden', list)).toBeFalsy();
                const group_els = lview.querySelectorAll('.muc-domain-group');
                expect(group_els.length).toBe(1);
                expect(group_els[0].children[0].innerText.trim()).toBe('conference.shakespeare.lit');

                // I would have liked to use u.isVisible on the room (.open-room) here,
                // but it didn’t seem to work.
                expect(u.hasClass('collapsed', lview.querySelector('.muc-domain-group-rooms'))).toBe(false);
                lview.querySelector('.muc-domain-group-toggle').click();
                await u.waitUntil(
                    () => u.hasClass('collapsed', lview.querySelector('.muc-domain-group-rooms')) === true,
                );
                expect(u.hasClass('collapsed', lview.querySelector('.muc-domain-group-rooms'))).toBe(true);
                lview.querySelector('.muc-domain-group-toggle').click();
                await u.waitUntil(
                    () => u.hasClass('collapsed', lview.querySelector('.muc-domain-group-rooms')) === false,
                );
                expect(u.hasClass('collapsed', lview.querySelector('.muc-domain-group-rooms'))).toBe(false);
            },
        ),
    );
});

describe('The list of groupchats grouped by kind', function () {
    it(
        'shows groups and channels under their own headings',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { muc_grouped_by_kind: true, allow_bookmarks: false },
            async function (_converse) {
                await mock.waitForRoster(_converse, 'current', 0);
                await mock.openControlBox(_converse);
                const lview = _converse.chatboxviews.get('controlbox').querySelector('converse-rooms-list');

                const group_jid = 'family@conference.shakespeare.lit';
                _converse.api.rooms.open(group_jid, { nick: 'romeo' });
                await mock.waitForMUCDiscoInfo(_converse, group_jid, [
                    'http://jabber.org/protocol/muc',
                    'muc_membersonly',
                    'muc_nonanonymous',
                ]);
                await u.waitUntil(() => lview.querySelectorAll('.rooms-kind--groups .open-room').length === 1);
                expect(lview.querySelector('.rooms-kind--channels')).toBe(null);
                // The channels heading and its menu are there even without channels.
                expect(lview.querySelector('.rooms-kind-heading--channels converse-dropdown')).not.toBe(null);

                const channel_jid = 'lounge@conference.shakespeare.lit';
                _converse.api.rooms.open(channel_jid, { nick: 'romeo' });
                await mock.waitForMUCDiscoInfo(_converse, channel_jid);
                await u.waitUntil(() => lview.querySelectorAll('.rooms-kind--channels .open-room').length === 1);

                // Two sections of their own, the rooms menu on the first one.
                const headings = Array.from(lview.querySelectorAll('.rooms-kind-heading .controlbox-heading'));
                expect(headings.map((el) => el.textContent.trim())).toEqual(['Groups', 'Channels']);
                // Each section has its menu; groups are not listed by the server.
                const menu = (kind) => lview.querySelector(`.rooms-kind-heading--${kind} converse-dropdown`).items;
                expect(menu('groups').length).toBe(2);
                expect(menu('channels').length).toBe(3);

                // Each section collapses on its own, from the caret by its heading.
                lview.querySelector('.rooms-kind-heading--groups .rooms-kind-toggle').click();
                await u.waitUntil(() => lview.querySelector('.rooms-kind--groups') === null);
                expect(lview.querySelector('.rooms-kind--channels')).not.toBe(null);
                expect(lview.querySelector('.rooms-kind-heading--groups converse-icon').classList).toContain(
                    'fa-caret-right',
                );
                expect(lview.model.get('collapsed_kinds')).toEqual(['groups']);
                lview.querySelector('.rooms-kind-heading--groups .rooms-kind-toggle').click();
                await u.waitUntil(() => lview.querySelector('.rooms-kind--groups .open-room'));
                expect(lview.model.get('collapsed_kinds')).toEqual([]);
            },
        ),
    );
});

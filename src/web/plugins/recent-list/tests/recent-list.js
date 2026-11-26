import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { dayjs, stx, u } = converse.env;

const SETTINGS = { view_mode: 'fullscreen', show_recent_list: true, allow_bookmarks: false };
const LOUNGE = 'lounge@montague.lit';
const GARDEN = 'garden@montague.lit';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {any} _converse */
async function getRecentList(_converse) {
    await mock.openControlBox(_converse);
    const controlbox = await u.waitUntil(() => _converse.chatboxviews.get('controlbox'));
    return u.waitUntil(() => controlbox.querySelector('converse-recent-list'));
}

/** @param {any} _converse */
const currentList = (_converse) => _converse.chatboxviews.get('controlbox').querySelector('converse-recent-list');

/** @param {Element} list */
const rowJIDs = (list) => Array.from(list.querySelectorAll('.recent-item')).map((el) => el.getAttribute('data-jid'));

/**
 * @param {Element} list
 * @param {string} jid
 */
const previewOf = (list, jid) => {
    const row = list.querySelector(`.recent-item[data-jid="${jid}"]`);
    return row?.querySelector('.recent-item__preview')?.textContent.replace(/\s+/g, ' ').trim();
};

/**
 * @param {Element} list
 * @param {string} label
 */
const chip = (list, label) =>
    Array.from(list.querySelectorAll('.recent-list__chip')).find((el) => el.textContent.trim() === label);

/**
 * @param {Element} list
 * @param {string} jid
 */
const rowOf = (list, jid) => list.querySelector(`.recent-item[data-jid="${jid}"]`);

/**
 * The labels of the actions in a row's dropdown menu.
 * @param {Element} row
 */
const rowActions = (row) =>
    Array.from(row.querySelectorAll('converse-dropdown .dropdown-item')).map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
    );

/**
 * Clicks "Pin to top" or "Unpin from top" in a row's menu and waits for the
 * row to show the result.
 * @param {any} _converse
 * @param {string} jid
 * @param {'pin'|'unpin'} action
 */
async function setPinned(_converse, jid, action) {
    const selector = action === 'pin' ? '.pin-conversation' : '.unpin-conversation';
    const action_el = await u.waitUntil(() => rowOf(currentList(_converse), jid)?.querySelector(selector));
    action_el.click();
    await u.waitUntil(() => {
        const row = rowOf(currentList(_converse), jid);
        return action === 'pin' ? !!row?.classList.contains('pinned') : !row?.classList.contains('pinned');
    });
}

/** @param {any} _converse @param {string} jid */
const pin = (_converse, jid) => setPinned(_converse, jid, 'pin');

/** @param {any} _converse @param {string} jid */
const unpin = (_converse, jid) => setPinned(_converse, jid, 'unpin');

/**
 * @param {string} muc_jid
 * @param {string} nick
 * @param {string} body
 */
const mucMessage = (muc_jid, nick, body) => stx`
    <message from="${muc_jid + '/' + nick}"
             id="${u.getUniqueId()}"
             to="romeo@montague.lit"
             type="groupchat"
             xmlns="jabber:client">
        <body>${body}</body>
    </message>`;

describe('The conversation list', function () {
    it(
        'mixes 1:1 chats and groupchats, most recent activity first',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            await mock.openChatBoxFor(_converse, contact_jid);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, contact_jid, 'Oi'));
            await sleep(5);
            const room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            await room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Bem-vindo'));

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 2);
            // The room was opened after the chat's last message.
            expect(rowJIDs(list)).toEqual([LOUNGE, contact_jid]);

            await sleep(5);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, contact_jid, 'Tudo bem?'));
            await u.waitUntil(() => rowJIDs(currentList(_converse))[0] === contact_jid);
            expect(rowJIDs(currentList(_converse))).toEqual([contact_jid, LOUNGE]);
        }),
    );

    it(
        'previews own messages with "You" and room messages with the nickname',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            await mock.sendMessage(_converse, view, 'Olá, tudo bem?');

            await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            const room = _converse.state.chatboxes.get(LOUNGE);
            await room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Bem-vindo'));

            const list = await getRecentList(_converse);
            await u.waitUntil(() => previewOf(list, contact_jid) === 'You: Olá, tudo bem?');
            await u.waitUntil(() => previewOf(list, LOUNGE) === 'capulet: Bem-vindo');
        }),
    );

    it(
        'filters by unread, contacts, groups and channels',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 2);
            const first = mock.getContactJID(0);
            const second = mock.getContactJID(1);
            await mock.openChatBoxFor(_converse, first);
            await mock.openChatBoxFor(_converse, second);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, first, 'Um'));
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, second, 'Dois'));
            // Messages received while the chat is hidden count as unread: only `second` should be.
            _converse.state.chatboxes.get(first).set('num_unread', 0);
            _converse.state.chatboxes.get(second).set('num_unread', 2);

            const lounge = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            const garden = await mock.openAndEnterMUC(_converse, GARDEN, 'romeo');
            await lounge.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Um'));
            await garden.handleMessageStanza(mucMessage(GARDEN, 'capulet', 'Dois'));
            // Messages received while the room is hidden count as unread/active:
            // only `second` should be.
            lounge.set({ num_unread: 0, num_unread_general: 0, has_activity: false });
            garden.set({ num_unread: 0, num_unread_general: 0, has_activity: false });
            // A group is members-only and non-anonymous; any other room is a channel.
            lounge.features.set({ membersonly: true, nonanonymous: true });
            garden.features.set({ membersonly: false, publicroom: true });

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 4);

            chip(list, 'Unread chats').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).join() === second);
            chip(list, 'Unread chats').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).length === 4);

            chip(list, 'Contacts').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).length === 2);
            expect(rowJIDs(currentList(_converse)).sort()).toEqual([first, second].sort());
            chip(list, 'Contacts').click();

            chip(list, 'Groups').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).join() === LOUNGE);
            chip(list, 'Groups').click();

            chip(list, 'Channels').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).join() === GARDEN);
            expect(chip(list, 'Channels').getAttribute('aria-pressed')).toBe('true');
        }),
    );

    it(
        'omits a groupchat whose archive is empty, until it receives a message',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            // The default disco info advertises MAM, but the mock doesn't answer
            // the archive query, so the room stays "loading" until we settle it.
            const empty_room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            expect(empty_room.session.get('mam_initialized')).toBe(false);

            await getRecentList(_converse);
            // While the history fetch is in flight the row is kept, so it doesn't
            // flicker away and back.
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(LOUNGE));

            // The archive settled and had no displayable message: the row goes.
            empty_room.session.save({ mam_initialized: true });
            await u.waitUntil(() => !rowJIDs(currentList(_converse)).includes(LOUNGE));

            // A room without MAM settles as soon as it is entered, and has history.
            const room_with_history = await mock.openAndEnterMUC(_converse, GARDEN, 'romeo', [
                'http://jabber.org/protocol/muc',
            ]);
            await room_with_history.handleMessageStanza(mucMessage(GARDEN, 'capulet', 'Com histórico'));
            await u.waitUntil(() => room_with_history.session.get('mam_initialized') === true);
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(GARDEN));
            expect(rowJIDs(currentList(_converse))).not.toContain(LOUNGE);

            await sleep(5);
            await empty_room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Agora tem'));
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(LOUNGE));
            const jids = rowJIDs(currentList(_converse));
            expect(jids).toContain(GARDEN);
            // The just-received message makes the formerly empty room the most recent.
            expect(jids.indexOf(LOUNGE)).toBeLessThan(jids.indexOf(GARDEN));
        }),
    );

    it(
        'keeps a closed 1:1 chat in the list, and reopens it when its row is clicked',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            await mock.openChatBoxFor(_converse, contact_jid);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, contact_jid, 'Oi'));
            const model = _converse.state.chatboxes.get(contact_jid);

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).includes(contact_jid));

            await model.close();
            expect(_converse.state.chatboxes.get(contact_jid)).toBeTruthy();
            expect(model.get('closed')).toBeTruthy();
            await u.waitUntil(() =>
                currentList(_converse).querySelector(`.recent-item[data-jid="${contact_jid}"].closed`),
            );

            currentList(_converse).querySelector(`.recent-item[data-jid="${contact_jid}"] .recent-item__link`).click();
            await u.waitUntil(() => model.get('closed') === false);
            expect(rowJIDs(currentList(_converse))).toContain(contact_jid);
        }),
    );

    it(
        'switches to the contacts view and back',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const list = await getRecentList(_converse);
            expect(list.querySelector('.recent-list__filters')).not.toBeNull();

            list.querySelector('.recent-list__contacts-btn').click();
            await u.waitUntil(() => currentList(_converse).querySelector('converse-roster'));
            expect(currentList(_converse).querySelector('.recent-list__filters')).toBeNull();

            currentList(_converse).querySelector('.recent-list__back').click();
            await u.waitUntil(() => !currentList(_converse).querySelector('converse-roster'));
            expect(currentList(_converse).querySelector('.recent-list__filters')).not.toBeNull();
        }),
    );
    it(
        'shows the activity time as the clock time today, "Yesterday", the day and month, or the full date',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 4);
            const today = new Date();
            today.setHours(9, 5, 0, 0);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(23, 59, 0, 0);
            const earlier = new Date();
            earlier.setDate(earlier.getDate() - 3);
            const older = new Date(2020, 4, 7, 10, 0);
            const times = {
                [mock.getContactJID(0)]: today.getTime(),
                [mock.getContactJID(1)]: yesterday.getTime(),
                [mock.getContactJID(2)]: earlier.getTime(),
                [mock.getContactJID(3)]: older.getTime(),
            };
            for (const [jid, time] of Object.entries(times)) {
                await mock.openChatBoxFor(_converse, jid);
                _converse.state.chatboxes.get(jid).set('time_opened', time);
            }

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 4);
            const same_year = earlier.getFullYear() === new Date().getFullYear();
            const expected = {
                [mock.getContactJID(0)]: '09:05',
                [mock.getContactJID(1)]: 'Yesterday',
                [mock.getContactJID(2)]: dayjs(earlier).format(same_year ? 'D MMM' : 'DD/MM/YY'),
                [mock.getContactJID(3)]: '07/05/20',
            };
            const timeOf = (jid) =>
                currentList(_converse)
                    .querySelector(`.recent-item[data-jid="${jid}"] .recent-item__time`)
                    ?.textContent.trim();
            for (const [jid, text] of Object.entries(expected)) {
                await u.waitUntil(() => timeOf(jid) === text);
                expect(timeOf(jid)).toBe(text);
            }
        }),
    );
});

describe('Closing a groupchat', function () {
    /**
     * A 1:1 chat behind a groupchat that is shown, then the groupchat is
     * closed.
     * @param {any} _converse
     * @param {boolean} connected
     */
    async function closeShownGroupchat(_converse, connected) {
        const { api, state } = _converse;
        await mock.waitForRoster(_converse, 'current', 1);
        const jid = mock.getContactJID(0);
        await mock.openChatBoxFor(_converse, jid);
        await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
        const chat = state.chatboxes.get(jid);
        await u.waitUntil(() => chat.get('hidden') === true);

        if (!connected) vi.spyOn(api.connection, 'connected').mockReturnValue(false);
        await state.chatboxes.get(LOUNGE).close();
        await sleep(100);
        return chat;
    }

    it(
        'shows the chat behind it',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const chat = await closeShownGroupchat(_converse, true);
            expect(chat.get('hidden')).toBe(false);
        }),
    );

    it(
        'shows nothing while disconnected (logging out closes every chat)',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const chat = await closeShownGroupchat(_converse, false);
            expect(chat.get('hidden')).toBe(true);
        }),
    );
});

describe('An open groupchat', function () {
    it(
        'is marked as a group only when members-only and non-anonymous',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const group_features = ['http://jabber.org/protocol/muc', 'muc_membersonly', 'muc_nonanonymous'];
            await mock.openAndEnterMUC(_converse, GARDEN, 'romeo', group_features);
            const group_view = await u.waitUntil(() => _converse.chatboxviews.get(GARDEN));
            await u.waitUntil(() => group_view.classList.contains('chatroom--group'));

            await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            const channel_view = await u.waitUntil(() => _converse.chatboxviews.get(LOUNGE));
            await sleep(50);
            expect(channel_view.classList.contains('chatroom--group')).toBe(false);

            // A room that becomes members-only and non-anonymous turns blue.
            channel_view.model.features.save({ membersonly: true, nonanonymous: true });
            await u.waitUntil(() => channel_view.classList.contains('chatroom--group'));
        }),
    );
});

describe('The "Notes to self" conversation', function () {
    // The isaCloud server allows messaging JIDs outside the roster, which is
    // what a chat with our own JID is.
    const NOTES_SETTINGS = { ...SETTINGS, allow_non_roster_messaging: true, notes_to_self: true };

    /** @param {any} _converse */
    async function openNotesToSelfChat(_converse) {
        const chat = await _converse.api.chats.open(_converse.bare_jid);
        await chat.initialized;
        return chat;
    }

    it(
        'only appears in the conversation list once it has a message, without the "You:" prefix',
        mock.initConverse(converse, ['chatBoxesFetched'], NOTES_SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await openNotesToSelfChat(_converse);
            const list = await getRecentList(_converse);
            expect(rowJIDs(list)).not.toContain(_converse.bare_jid);

            await _converse.handleMessageStanza(
                mock.createChatMessage(_converse, _converse.bare_jid, 'Minha primeira nota'),
            );
            const self_jid = _converse.bare_jid;
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(self_jid));
            const row = currentList(_converse).querySelector(`.recent-item[data-jid="${self_jid}"]`);
            expect(row.querySelector('.recent-item__name').textContent.trim()).toBe('Notes to self');
            expect(row.querySelector('.recent-item__prefix')).toBeNull();
            expect(previewOf(currentList(_converse), self_jid)).toBe('Minha primeira nota');
        }),
    );

    it(
        'is the first item of the contacts section, and opens the chat with our own JID',
        mock.initConverse(converse, ['chatBoxesFetched'], NOTES_SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const list = await getRecentList(_converse);
            list.querySelector('.recent-list__contacts-btn').click();

            const roster = await u.waitUntil(() => currentList(_converse).querySelector('#converse-roster'));
            const row = await u.waitUntil(() => roster.querySelector('.notes-to-self'));
            expect(row.querySelector('.contact-name').textContent.trim()).toBe('Notes to self');
            expect(row.querySelector('.list-item-link').getAttribute('title')).toBe('Open your notes');

            // It sits before the first group and outside it, above the contacts.
            const first_group = roster.querySelector('.roster-group');
            expect(row.closest('.roster-group')).toBeNull();
            expect(first_group.previousElementSibling).toBe(row);

            const trigger = vi.spyOn(_converse.api, 'trigger');
            row.querySelector('.list-item-link').click();
            expect(trigger).toHaveBeenCalledWith('openConversation', { view: 'chat', jid: _converse.bare_jid });
        }),
    );

    it(
        'has a pin action but no "Remove from list" menu, unlike other 1:1 chats',
        mock.initConverse(converse, ['chatBoxesFetched'], NOTES_SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            await mock.openChatBoxFor(_converse, contact_jid);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, contact_jid, 'Oi'));

            await openNotesToSelfChat(_converse);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, _converse.bare_jid, 'Uma nota'));

            const list = await getRecentList(_converse);
            const self_jid = _converse.bare_jid;
            await u.waitUntil(
                () =>
                    rowOf(list, self_jid)?.querySelector('.pin-conversation') &&
                    rowOf(list, contact_jid)?.querySelector('.pin-conversation'),
            );
            const self_row = rowOf(list, self_jid);
            const contact_row = rowOf(list, contact_jid);
            expect(self_row.querySelector('converse-dropdown')).not.toBeNull();
            expect(rowActions(self_row)).toContain('Pin to top');
            expect(rowActions(self_row)).not.toContain('Remove from list');
            expect(rowActions(contact_row)).toContain('Remove from list');
            expect(rowActions(contact_row)).toContain('Pin to top');
        }),
    );

    it(
        'has no status line and no block button in the chat header',
        mock.initConverse(converse, ['chatBoxesFetched'], NOTES_SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openControlBox(_converse);
            // Our own profile's status is what the header would otherwise show.
            _converse.state.profile.set('status_message', 'Trabalhando nas notas');
            await openNotesToSelfChat(_converse);

            const view = await u.waitUntil(() => _converse.chatboxviews.get(_converse.bare_jid));
            await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .show-user-details-modal'));
            expect(view.querySelector('.chat-head__desc')).toBeNull();
            expect(view.querySelector('.block-user')).toBeNull();
            expect(view.querySelector('.unblock-user')).toBeNull();
            // "Details" and "Close" stay.
            expect(view.querySelector('.close-chatbox-button')).not.toBeNull();
        }),
    );
});

describe('Pinning conversations in the recent list', function () {
    // Notes to self needs the same settings as in the conversation list specs.
    const NOTES_SETTINGS = { ...SETTINGS, allow_non_roster_messaging: true, notes_to_self: true };

    it(
        'pins a 1:1 chat to the top and unpins it',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            await mock.openChatBoxFor(_converse, contact_jid);
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, contact_jid, 'Oi'));

            await sleep(5);
            const room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            await room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Bem-vindo'));

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 2);
            // The room's message is more recent, so it is on top.
            expect(rowJIDs(list)).toEqual([LOUNGE, contact_jid]);

            const pin_action = await u.waitUntil(() =>
                rowOf(currentList(_converse), contact_jid)?.querySelector('.pin-conversation'),
            );
            expect(pin_action.textContent.trim()).toBe('Pin to top');

            await pin(_converse, contact_jid);
            const current = currentList(_converse);
            expect(rowJIDs(current)).toEqual([contact_jid, LOUNGE]);
            const pinned_row = rowOf(current, contact_jid);
            expect(pinned_row.classList.contains('pinned')).toBe(true);
            expect(pinned_row.querySelector('.recent-item__pin')).not.toBeNull();
            expect(_converse.state.chatboxes.get(contact_jid).get('pinned_order')).toBeGreaterThan(0);
            expect(pinned_row.querySelector('.pin-conversation')).toBeNull();
            expect(pinned_row.querySelector('.unpin-conversation').textContent.trim()).toBe('Unpin from top');

            await unpin(_converse, contact_jid);
            const unpinned_row = rowOf(currentList(_converse), contact_jid);
            expect(unpinned_row.classList.contains('pinned')).toBe(false);
            expect(unpinned_row.querySelector('.recent-item__pin')).toBeNull();
            expect(_converse.state.chatboxes.get(contact_jid).get('pinned_order') > 0).toBe(false);
            expect(rowJIDs(currentList(_converse))).toEqual([LOUNGE, contact_jid]);
            expect(unpinned_row.querySelector('.pin-conversation')).not.toBeNull();
        }),
    );

    it(
        'pins a 1:1 chat from the conversation header menu',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            // The 1:1 heading only renders its buttons once the blocklist query
            // settles (the blocking check is part of getHeadingButtons).
            await mock.waitUntilBlocklistInitialized(_converse);
            const contact_jid = mock.getContactJID(0);
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            await mock.sendMessage(_converse, view, 'Oi');

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).includes(contact_jid));

            const header_pin = await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .pin-conversation'));
            expect(header_pin.textContent.trim()).toBe('Pin to top');
            header_pin.click();

            await u.waitUntil(() => _converse.state.chatboxes.get(contact_jid).get('pinned_order') > 0);
            await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .unpin-conversation'));
            await u.waitUntil(() => rowOf(currentList(_converse), contact_jid)?.classList.contains('pinned'));

            view.querySelector('.chatbox-title__buttons .unpin-conversation').click();
            await u.waitUntil(() => !(_converse.state.chatboxes.get(contact_jid).get('pinned_order') > 0));
            await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .pin-conversation'));
            await u.waitUntil(() => !rowOf(currentList(_converse), contact_jid)?.classList.contains('pinned'));
        }),
    );

    it(
        'pins a groupchat from its header menu',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            await room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Bem-vindo'));

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).includes(LOUNGE));

            const view = await u.waitUntil(() => _converse.chatboxviews.get(LOUNGE));
            const header_pin = await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .pin-conversation'));
            header_pin.click();

            await u.waitUntil(() => room.get('pinned_order') > 0);
            await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .unpin-conversation'));
            await u.waitUntil(() => rowOf(currentList(_converse), LOUNGE)?.classList.contains('pinned'));
            expect(rowOf(currentList(_converse), LOUNGE).querySelector('.recent-item__pin')).not.toBeNull();
        }),
    );

    it(
        'pins a groupchat and "Notes to self", which has no "Remove from list" action',
        mock.initConverse(converse, ['chatBoxesFetched'], NOTES_SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            await room.handleMessageStanza(mucMessage(LOUNGE, 'capulet', 'Bem-vindo'));

            const notes = await _converse.api.chats.open(_converse.bare_jid);
            await notes.initialized;
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, _converse.bare_jid, 'Uma nota'));

            const list = await getRecentList(_converse);
            const self_jid = _converse.bare_jid;
            await u.waitUntil(() => rowJIDs(list).length === 2);
            expect(rowJIDs(list).sort()).toEqual([LOUNGE, self_jid].sort());

            const notes_row = await u.waitUntil(() => {
                const row = rowOf(list, self_jid);
                return row?.querySelector('.pin-conversation') ? row : null;
            });
            expect(rowActions(notes_row)).toContain('Pin to top');
            expect(rowActions(notes_row)).not.toContain('Remove from list');

            await pin(_converse, LOUNGE);
            await pin(_converse, self_jid);

            const current = currentList(_converse);
            for (const jid of [LOUNGE, self_jid]) {
                const row = rowOf(current, jid);
                expect(row.classList.contains('pinned')).toBe(true);
                expect(row.querySelector('.recent-item__pin')).not.toBeNull();
                expect(row.querySelector('.unpin-conversation')).not.toBeNull();
            }
            // The room was pinned first, so it stays above Notes to self.
            expect(rowJIDs(current).slice(0, 2)).toEqual([LOUNGE, self_jid]);
            expect(rowActions(rowOf(current, self_jid))).not.toContain('Remove from list');
        }),
    );

    it(
        'orders pinned conversations by pin order, not by activity or name',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 3);
            const jids = [0, 1, 2].map((i) => mock.getContactJID(i));
            // Each message is newer than the previous one, so activity order is
            // the reverse of the pin order below.
            for (const jid of jids) {
                const view = await mock.openChatBoxFor(_converse, jid);
                await mock.sendMessage(_converse, view, `Oi ${jid}`);
                await sleep(20);
            }

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 3);
            expect(rowJIDs(list)).toEqual([...jids].reverse());

            for (const jid of jids) await pin(_converse, jid);
            await u.waitUntil(() => rowJIDs(currentList(_converse)).join() === jids.join());
            expect(rowJIDs(currentList(_converse))).toEqual(jids);
            expect(currentList(_converse).querySelectorAll('.recent-item.pinned').length).toBe(3);

            const orders = jids.map((jid) => _converse.state.chatboxes.get(jid).get('pinned_order'));
            expect(orders[0]).toBeLessThan(orders[1]);
            expect(orders[1]).toBeLessThan(orders[2]);
        }),
    );

    it(
        'allows at most 3 pinned conversations',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 4);
            await mock.waitUntilBlocklistInitialized(_converse);
            const jids = [0, 1, 2, 3].map((i) => mock.getContactJID(i));
            for (const jid of jids) {
                const view = await mock.openChatBoxFor(_converse, jid);
                await mock.sendMessage(_converse, view, `Oi ${jid}`);
                await sleep(10);
            }

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 4);
            for (const jid of jids.slice(0, 3)) await pin(_converse, jid);

            const unpinned_jid = jids[3];
            const pin_action = await u.waitUntil(() =>
                rowOf(currentList(_converse), unpinned_jid)?.querySelector('.pin-conversation'),
            );
            expect(pin_action.classList.contains('disabled')).toBe(true);
            expect(pin_action.getAttribute('aria-disabled')).toBe('true');
            expect(Number(getComputedStyle(pin_action).opacity)).toBeLessThan(1);

            const view = await u.waitUntil(() => _converse.chatboxviews.get(unpinned_jid));
            const header_pin = await u.waitUntil(() => view.querySelector('.chatbox-title__buttons .pin-conversation'));
            expect(header_pin.classList.contains('disabled')).toBe(true);
            expect(header_pin.getAttribute('aria-disabled')).toBe('true');
            expect(Number(getComputedStyle(header_pin).opacity)).toBeLessThan(1);

            // A disabled pin does nothing.
            pin_action.click();
            header_pin.click();
            await sleep(50);
            expect(_converse.state.chatboxes.get(unpinned_jid).get('pinned_order') > 0).toBe(false);
            expect(currentList(_converse).querySelectorAll('.recent-item.pinned').length).toBe(3);
            expect(rowOf(currentList(_converse), unpinned_jid).classList.contains('pinned')).toBe(false);
        }),
    );

    it(
        'keeps filters applied to pinned conversations',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.getContactJID(0);
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            await mock.sendMessage(_converse, view, 'Oi');

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).includes(contact_jid));
            await pin(_converse, contact_jid);

            // The 1:1 is pinned, but it is still not a group.
            chip(currentList(_converse), 'Groups').click();
            await u.waitUntil(() => !rowJIDs(currentList(_converse)).includes(contact_jid));
            expect(rowOf(currentList(_converse), contact_jid)).toBeNull();

            chip(currentList(_converse), 'Groups').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(contact_jid));
            const row = rowOf(currentList(_converse), contact_jid);
            expect(row.classList.contains('pinned')).toBe(true);
            expect(row.querySelector('.recent-item__pin')).not.toBeNull();
            expect(_converse.state.chatboxes.get(contact_jid).get('pinned_order')).toBeGreaterThan(0);
        }),
    );

    it(
        'saves the pin on the chatbox, so it survives a re-render',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 2);
            const contact_jid = mock.getContactJID(0);
            const other_jid = mock.getContactJID(1);
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            await mock.sendMessage(_converse, view, 'Oi');
            await sleep(5);
            const other_view = await mock.openChatBoxFor(_converse, other_jid);
            await mock.sendMessage(_converse, other_view, 'Oi');

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).length === 2);
            await pin(_converse, contact_jid);

            const model = _converse.state.chatboxes.get(contact_jid);
            expect(Number.isInteger(model.get('pinned_order'))).toBe(true);
            expect(model.get('pinned_order')).toBeGreaterThan(0);

            // Going to the contacts view and back re-renders the list.
            list.querySelector('.recent-list__contacts-btn').click();
            await u.waitUntil(() => currentList(_converse).querySelector('converse-roster'));
            currentList(_converse).querySelector('.recent-list__back').click();
            await u.waitUntil(() => rowJIDs(currentList(_converse)).includes(contact_jid));

            const row = rowOf(currentList(_converse), contact_jid);
            expect(row.classList.contains('pinned')).toBe(true);
            expect(row.querySelector('.recent-item__pin')).not.toBeNull();
            expect(rowJIDs(currentList(_converse))[0]).toBe(contact_jid);
        }),
    );

    it(
        'keeps a pinned room with an empty archive visible, and drops it when unpinned',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const room = await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            expect(room.session.get('mam_initialized')).toBe(false);

            const list = await getRecentList(_converse);
            await u.waitUntil(() => rowJIDs(list).includes(LOUNGE));
            await pin(_converse, LOUNGE);

            // The archive settles empty; an unpinned room would disappear.
            room.session.save({ mam_initialized: true });
            await sleep(150);
            expect(rowJIDs(currentList(_converse))).toContain(LOUNGE);
            expect(rowOf(currentList(_converse), LOUNGE).classList.contains('pinned')).toBe(true);

            await unpin(_converse, LOUNGE);
            await u.waitUntil(() => !rowJIDs(currentList(_converse)).includes(LOUNGE));
        }),
    );
});

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
            await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');

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

            await mock.openAndEnterMUC(_converse, LOUNGE, 'romeo');
            await mock.openAndEnterMUC(_converse, GARDEN, 'romeo');
            // A group is members-only and non-anonymous; any other room is a channel.
            _converse.state.chatboxes.get(LOUNGE).features.set({ membersonly: true, nonanonymous: true });
            _converse.state.chatboxes.get(GARDEN).features.set({ membersonly: false, publicroom: true });

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

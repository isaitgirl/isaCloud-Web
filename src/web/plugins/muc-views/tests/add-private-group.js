import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

/**
 * Opens the add modal from the "Groups" or "Channels" section menu.
 * @param {any} _converse
 * @param {'group'|'channel'} kind
 */
async function openFromSection(_converse, kind) {
    await mock.openControlBox(_converse);
    const controlbox = await u.waitUntil(() => _converse.chatboxviews.get('controlbox'));
    const link = await u.waitUntil(() => controlbox.querySelector(`.show-add-muc-modal--${kind}`));
    link.click();
    const modal = _converse.api.modal.get('converse-add-muc-modal');
    await u.waitUntil(() => u.isVisible(modal), 1000);
    return modal;
}

describe('Adding a groupchat from the Groups and Channels sections', () => {
    it(
        '"Add group" creates a private, members-only and non-anonymous group',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { muc_domain: 'muc.example.org', muc_grouped_by_kind: true, allow_bookmarks: false },
            async (_converse) => {
                const modal = await openFromSection(_converse, 'group');
                expect(modal.querySelector('.modal-title').textContent.trim()).toBe('New group');
                expect(modal.querySelector('label[for="chatroom"]').textContent.trim()).toBe('Group name:');
                expect(modal.querySelector('.add-muc-group-hint')).not.toBe(null);
                expect(modal.querySelector('form input[type="submit"]').value).toBe('Create');

                const opened = vi.fn();
                _converse.api.listen.on('openConversation', opened);
                modal.querySelector('input[name="chatroom"]').value = 'Família';
                modal.querySelector('input[name="nickname"]').value = 'romeo';
                modal.querySelector('form input[type="submit"]').click();

                await u.waitUntil(() => opened.mock.calls.length);
                const { view, jid, attrs } = opened.mock.calls[0][0];
                expect(view).toBe('room');
                expect(jid).toBe('familia@muc.example.org');
                expect(attrs.auto_configure).toBe(true);
                expect(attrs.roomconfig).toEqual({
                    roomname: 'Família',
                    membersonly: true,
                    whois: 'anyone',
                    publicroom: false,
                    persistentroom: true,
                });
            },
        ),
    );

    it(
        '"Add channel" keeps the server defaults',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { muc_domain: 'muc.example.org', muc_grouped_by_kind: true, allow_bookmarks: false },
            async (_converse) => {
                const modal = await openFromSection(_converse, 'channel');
                expect(modal.querySelector('.modal-title').textContent.trim()).toBe('New channel');
                expect(modal.querySelector('.add-muc-group-hint')).toBe(null);

                const opened = vi.fn();
                _converse.api.listen.on('openConversation', opened);
                modal.querySelector('input[name="chatroom"]').value = 'lounge';
                modal.querySelector('input[name="nickname"]').value = 'romeo';
                modal.querySelector('form input[type="submit"]').click();

                await u.waitUntil(() => opened.mock.calls.length);
                const { jid, attrs } = opened.mock.calls[0][0];
                expect(jid).toBe('lounge@muc.example.org');
                expect(attrs.roomconfig).toEqual({ roomname: 'lounge' });
                expect(attrs.roomconfig.membersonly).toBeUndefined();
            },
        ),
    );
});

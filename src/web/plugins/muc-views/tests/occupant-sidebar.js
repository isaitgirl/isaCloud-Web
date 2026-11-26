import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

describe('The occupant sidebar', () => {
    it(
        'shows translated role and affiliation names, also in the details modal',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 0);
            const muc_jid = 'coven@chat.shakespeare.lit';
            const members = [{ nick: 'firstwitch', jid: 'witch@wiccarocks.lit', affiliation: 'member' }];
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo', [], members);

            const view = _converse.chatboxviews.get(muc_jid);
            await u.waitUntil(() => view.model.occupants.length === 2);
            const occupant = view.model.occupants.findWhere({ nick: 'firstwitch' });
            occupant.save({ role: 'participant' });
            view.model.save({ hidden_occupants: false, sidebar_view: `occupant:${occupant.id}` });

            const sidebar = await u.waitUntil(() => view.querySelector('.sidebar-occupant'));
            const badges = await u.waitUntil(() => sidebar.querySelectorAll('.occupant-details .badge'));
            expect(Array.from(badges).map((b) => b.textContent.trim())).toEqual(['Member', 'Participant']);

            sidebar.querySelector('.show-occupant-modal').click();
            const modal = await u.waitUntil(() =>
                document.querySelector('converse-muc-occupant-modal .occupant-details'),
            );
            const text = modal.textContent;
            expect(text).toContain('Member');
            expect(text).toContain('Participant');
            expect(text).not.toMatch(/\bparticipant\b/);
            expect(text).not.toMatch(/\bmember\b/);
        }),
    );

    it(
        "explains, instead of failing, that private messages to participants aren't encrypted",
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 0);
            await mock.initializedOMEMO(_converse);
            const muc_jid = 'coven@chat.shakespeare.lit';
            const members = [{ nick: 'firstwitch', jid: 'witch@wiccarocks.lit', affiliation: 'member' }];
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo', [], members);

            const view = _converse.chatboxviews.get(muc_jid);
            await u.waitUntil(() => view.model.occupants.length === 2);
            const occupant = view.model.occupants.findWhere({ nick: 'firstwitch' });
            view.model.save({ hidden_occupants: false, sidebar_view: `occupant:${occupant.id}` });

            const sidebar = await u.waitUntil(() => view.querySelector('.sidebar-occupant'));
            const toggle = await u.waitUntil(() => sidebar.querySelector('.toggle-omemo'));
            expect(toggle.querySelector('converse-icon').classList.contains('fa-unlock')).toBe(true);

            const alert = vi.spyOn(_converse.api, 'alert').mockResolvedValue(undefined);
            toggle.click();
            expect(alert).toHaveBeenCalledOnce();
            expect(alert.mock.calls[0][2]).toEqual([
                'Private messages to groupchat participants are not end-to-end encrypted.',
            ]);
            expect(occupant.get('omemo_active')).toBeFalsy();
        }),
    );

    it(
        'offers an encrypted direct chat instead of private messages in a private group',
        mock.initConverse(converse, ['chatBoxesFetched'], { view_mode: 'fullscreen' }, async (_converse) => {
            await mock.waitForRoster(_converse, 'current', 0);
            const features = [
                'http://jabber.org/protocol/muc',
                'jabber:iq:register',
                'muc_hidden',
                'muc_persistent',
                'muc_membersonly',
                'muc_nonanonymous',
                'muc_unmoderated',
            ];
            const muc_jid = 'coven@chat.shakespeare.lit';
            const members = [{ nick: 'firstwitch', jid: 'witch@wiccarocks.lit', affiliation: 'member' }];
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo', features, members);

            const view = _converse.chatboxviews.get(muc_jid);
            expect(view.model.isGroup()).toBe(true);
            await u.waitUntil(() => view.model.occupants.length === 2);
            const occupant = view.model.occupants.findWhere({ nick: 'firstwitch' });
            view.model.save({ hidden_occupants: false, sidebar_view: `occupant:${occupant.id}` });

            const sidebar = await u.waitUntil(() => view.querySelector('.sidebar-occupant'));
            const button = await u.waitUntil(() => sidebar.querySelector('.open-direct-chat'));
            expect(sidebar.querySelector('converse-muc-message-form')).toBe(null);
            expect(button.querySelector('converse-icon').classList.contains('fa-lock')).toBe(true);

            const opened = vi.fn();
            _converse.api.listen.on('openConversation', opened);
            button.click();
            expect(opened).toHaveBeenCalledWith({ view: 'chat', jid: 'witch@wiccarocks.lit' });

            // An anonymous room is a channel: private messages are offered again.
            view.model.features.save({ nonanonymous: false, semianonymous: true });
            await u.waitUntil(() => sidebar.querySelector('converse-muc-message-form'));
            expect(sidebar.querySelector('.open-direct-chat')).toBe(null);
        }),
    );
});

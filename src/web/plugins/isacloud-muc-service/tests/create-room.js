import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { sizzle, u } = converse.env;

const SETTINGS = {
    muc_grouped_by_kind: true,
    whitelisted_plugins: ['converse-isacloud-muc-service'],
};

describe('Creating a room with the isaCloud MUC service', function () {
    it(
        'creates a channel on the MUC service of the account domain',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            _converse.session.save({ bare_jid: 'pompom@isacloud.im', domain: 'isacloud.im' });
            // `muc-views` writes the first discovered service into this setting; the
            // account mapping must still win.
            _converse.api.settings.set('muc_domain', 'canais.voz.social.br');
            vi.spyOn(_converse.ChatRoom.prototype, 'getDiscoInfo').mockResolvedValue();

            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            const button = await u.waitUntil(() =>
                cbview.querySelector('converse-rooms-list .show-add-muc-modal--channel'),
            );
            button.click();
            const modal = _converse.api.modal.get('converse-add-muc-modal');
            await u.waitUntil(() => u.isVisible(modal), 1000);

            modal.querySelector('input[name="chatroom"]').value = 'turma do pompom 2';
            modal.querySelector('input[name="nickname"]').value = 'pompom';
            modal.querySelector('form input[type="submit"]').click();

            const jid = 'turma-do-pompom-2@conference.isacloud.cc';
            await mock.waitForMUCDiscoInfo(_converse, jid);
            await u.waitUntil(() => _converse.chatboxes.length);
            await u.waitUntil(() => sizzle('.chatroom', _converse.el).filter(u.isVisible).length === 1);
            expect(_converse.chatboxes.models.map((m) => m.get('id')).includes(jid)).toBe(true);
        }),
    );
});

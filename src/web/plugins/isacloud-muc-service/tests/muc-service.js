import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, u } = converse.env;

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-muc-service'],
};

const LOCKED_SETTINGS = {
    ...SETTINGS,
    muc_domain: 'locked.muc.example.org',
};

/**
 * Pretends the logged-in account is `bare_jid`, which is what
 * `getDefaultMUCService` reads from the session.
 * @param {any} _converse
 * @param {string} bare_jid
 * @param {string} [default_muc_service]
 */
function setAccount(_converse, bare_jid, default_muc_service = undefined) {
    _converse.session.save({
        bare_jid,
        domain: Strophe.getDomainFromJid(bare_jid),
        default_muc_service,
    });
}

/**
 * A disco item, in the shape `api.disco.entities.items` returns.
 * @param {string} jid
 */
function discoItem(jid) {
    return { get: (/** @type {string} */ attr) => (attr === 'jid' ? jid : undefined) };
}

describe('The isaCloud MUC service by domain', function () {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it(
        'creates isacloud.im groups on conference.isacloud.cc',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@isacloud.im');
            expect(await u.muc.getDefaultMUCService()).toBe('conference.isacloud.cc');
        }),
    );

    it(
        'creates voz.social.br groups on canais.voz.social.br',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@voz.social.br');
            expect(await u.muc.getDefaultMUCService()).toBe('canais.voz.social.br');
        }),
    );

    it(
        'creates xmpp.social.br groups on canais.xmpp.social.br',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@xmpp.social.br');
            expect(await u.muc.getDefaultMUCService()).toBe('canais.xmpp.social.br');
        }),
    );

    it(
        'prefers the mapping over a default_muc_service already in the session cache',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@voz.social.br', 'old.muc.example.org');
            expect(await u.muc.getDefaultMUCService()).toBe('canais.voz.social.br');
        }),
    );

    it(
        'prefers the mapping over a muc_domain discovered at runtime',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@isacloud.im');
            // `muc-views` writes the first discovered service into this setting.
            _converse.api.settings.set('muc_domain', 'canais.voz.social.br');
            expect(await u.muc.getDefaultMUCService()).toBe('conference.isacloud.cc');
        }),
    );

    it(
        'keeps a configured muc_domain ahead of the mapping',
        mock.initConverse(converse, [], LOCKED_SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@voz.social.br');
            expect(await u.muc.getDefaultMUCService()).toBe('locked.muc.example.org');
        }),
    );

    it(
        'falls back to the first discovered service for other domains',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            setAccount(_converse, 'ana@example.org');

            const items = vi.spyOn(_converse.api.disco.entities, 'items');
            items.mockResolvedValue([discoItem('first.muc.example.org'), discoItem('second.muc.example.org')]);
            vi.spyOn(_converse.api.disco.features, 'has').mockResolvedValue(true);

            expect(await u.muc.getDefaultMUCService()).toBe('first.muc.example.org');
            expect(items).toHaveBeenCalledWith('example.org');
        }),
    );
});

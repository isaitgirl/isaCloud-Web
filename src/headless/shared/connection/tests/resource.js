import { initConverse } from '../../../tests/mock.js';
import converse from '../../../dist/converse-headless.js';

/**
 * Logs in and returns the resource saved for the session before connecting
 * (the mock server binds its own resource afterwards).
 * @param {any} _converse
 * @param {string} jid
 */
async function resourceOnLogin(_converse, jid) {
    const seen = new Promise((resolve) =>
        _converse.api.listen.once('setUserJID', () => resolve(_converse.session.get('resource'))),
    );
    await _converse.api.user.login(jid, 'secret');
    return seen;
}

describe('The generated XMPP resource', function () {
    it(
        'starts with "converse.js-" by default',
        initConverse(converse, [], { auto_login: false }, async (_converse) => {
            expect(await resourceOnLogin(_converse, 'romeo@montague.lit')).toMatch(/^converse\.js-\d+$/);
        }),
    );

    it(
        'starts with the "resource_prefix" setting',
        initConverse(converse, [], { auto_login: false, resource_prefix: 'isaCloudWeb' }, async (_converse) => {
            expect(await resourceOnLogin(_converse, 'romeo@montague.lit')).toMatch(/^isaCloudWeb-\d+$/);
        }),
    );

    it(
        'is kept when the JID already has one',
        initConverse(converse, [], { auto_login: false, resource_prefix: 'isaCloudWeb' }, async (_converse) => {
            expect(await resourceOnLogin(_converse, 'romeo@montague.lit/orchard')).toBe('orchard');
        }),
    );
});

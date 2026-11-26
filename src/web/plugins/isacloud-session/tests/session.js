import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SESSION_COOKIE = 'isacloud_session';

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-session'],
};

/** @returns {void} */
function clearSessionCookie() {
    document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
}

/** @param {string} value */
function setSessionCookie(value) {
    document.cookie = `${SESSION_COOKIE}=${value}; path=/`;
}

/** @returns {Promise<void>} */
function waitForSessionCookie() {
    return u.waitUntil(() => document.cookie.includes(`${SESSION_COOKIE}=`));
}

describe('The isaCloud browser-session login', function () {
    beforeEach(clearSessionCookie);
    afterEach(clearSessionCookie);

    it(
        'does not auto-login without the session cookie',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            expect(_converse.api.settings.get('keepalive')).toBe(false);
        }),
    );

    it('keeps auto-login with the session cookie, as on a reload or another tab', async function () {
        // The mock logs out a still-connected instance from the previous test
        // first, which clears the session and would drop the cookie set here.
        if (window._converse?.api.connection.connected()) await window._converse.api.user.logout();
        setSessionCookie('1');
        await mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            expect(_converse.api.settings.get('keepalive')).toBe(true);
            expect(document.cookie).toContain(`${SESSION_COOKIE}=1`);
        })();
    });

    it(
        'writes the session cookie once connected',
        mock.initConverse(converse, [], SETTINGS, async function () {
            // The mock logs in after the init, as the login form would.
            await waitForSessionCookie();
            expect(document.cookie).toContain(`${SESSION_COOKIE}=`);
        }),
    );

    it(
        'removes the session cookie when the session is cleared',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            await waitForSessionCookie();
            _converse.api.trigger('clearSession');
            expect(document.cookie).not.toContain(`${SESSION_COOKIE}=`);
        }),
    );
});

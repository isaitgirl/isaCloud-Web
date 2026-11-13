import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-update'],
    isacloud_version: 'aaa1111',
    isacloud_update_interval: 0,
};

/**
 * Stubs `fetch`: `version.json` answers with `published` (or fails when it is
 * an Error, or 404 when null), the clear URL answers 204, the rest goes through.
 * @param {string|Error|null} published
 */
function stubFetch(published, { slow_clear = false } = {}) {
    const original = globalThis.fetch;
    const fake = vi.fn(async (/** @type {any} */ input, /** @type {any} */ init) => {
        const url = String(input);
        if (url.includes('version.json')) {
            if (published instanceof Error) throw published;
            if (published === null) return new Response('', { status: 404 });
            return new Response(JSON.stringify({ version: published }), { status: 200 });
        }
        if (url.includes('atualizar')) {
            // Chrome holds this response until the cache is cleared, which can take seconds.
            if (slow_clear) return new Promise(() => {});
            return new Response(null, { status: 204 });
        }
        return original(input, init);
    });
    vi.stubGlobal('fetch', fake);
    return fake;
}

/** @param {any} _converse */
function reset(_converse) {
    const { update_state } = _converse.exports.isacloud_update;
    update_state.available = null;
    update_state.updating = false;
}

const versionCalls = (/** @type {any} */ fake) =>
    fake.mock.calls.filter(([url]) => String(url).includes('version.json'));

describe('The isaCloud new version notice', function () {
    afterEach(() => vi.unstubAllGlobals());

    it(
        'shows a button before the settings gear when a newer version is published',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            reset(_converse);
            const fake = stubFetch('bbb2222');
            const { checkForUpdate, update_state } = _converse.exports.isacloud_update;
            expect(await checkForUpdate()).toBe(true);
            expect(update_state.available).toBe('bbb2222');

            const url = new URL(String(versionCalls(fake).at(-1)[0]));
            expect(url.pathname.endsWith('/version.json')).toBe(true);
            expect(url.searchParams.get('t')).toBeTruthy();
            expect(versionCalls(fake).at(-1)[1]).toEqual({ cache: 'no-store' });

            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            await u.waitUntil(() => cbview.querySelector('a.show-client-info'));
            const btn = await u.waitUntil(() => cbview.querySelector('.isacloud-update-btn'));
            expect(btn.closest('converse-isacloud-update-button').nextElementSibling.classList).toContain(
                'btn-toolbar',
            );
            expect(btn.querySelector('converse-icon').getAttribute('class')).toContain('fa-sync');
            expect(btn.getAttribute('title')).toBe('New version available, click to update');
        }),
    );

    it(
        'shows nothing when the published version is the loaded one, or cannot be read',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            reset(_converse);
            const { checkForUpdate } = _converse.exports.isacloud_update;
            for (const published of ['aaa1111', null, new Error('offline')]) {
                stubFetch(published);
                expect(await checkForUpdate()).toBe(false);
            }
            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            await u.waitUntil(() => cbview.querySelector('a.show-client-info'));
            expect(cbview.querySelector('.isacloud-update-btn')).toBeNull();
        }),
    );

    it(
        'does not check on a page without a version',
        mock.initConverse(converse, [], { ...SETTINGS, isacloud_version: '' }, async function (_converse) {
            reset(_converse);
            const fake = stubFetch('bbb2222');
            const { checkForUpdate, getLoadedVersion } = _converse.exports.isacloud_update;
            expect(getLoadedVersion()).toBe('');
            expect(await checkForUpdate()).toBe(false);
            expect(versionCalls(fake).length).toBe(0);
        }),
    );

    it(
        'clears the cache through the clear URL and reloads when clicked',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            reset(_converse);
            const fake = stubFetch('bbb2222');
            const { actions, checkForUpdate } = _converse.exports.isacloud_update;
            const reload = vi.spyOn(actions, 'reload').mockImplementation(() => {});
            await checkForUpdate();
            await mock.openControlBox(_converse);
            const cbview = _converse.chatboxviews.get('controlbox');
            const btn = await u.waitUntil(() => cbview.querySelector('.isacloud-update-btn'));
            btn.click();
            await u.waitUntil(() => reload.mock.calls.length === 1);
            const clear = fake.mock.calls.filter(([url]) => String(url).includes('atualizar'));
            expect(clear.length).toBe(1);
            expect(new URL(String(clear[0][0])).pathname.endsWith('/atualizar')).toBe(true);
            reload.mockRestore();
        }),
    );

    it(
        'spins at once on a click and reloads without waiting long for a slow clear URL',
        mock.initConverse(
            converse,
            [],
            { ...SETTINGS, isacloud_update_clear_timeout: 300 },
            async function (_converse) {
                reset(_converse);
                const fake = stubFetch('bbb2222', { slow_clear: true });
                const { actions, checkForUpdate } = _converse.exports.isacloud_update;
                const reload = vi.spyOn(actions, 'reload').mockImplementation(() => {});
                await checkForUpdate();
                await mock.openControlBox(_converse);
                const cbview = _converse.chatboxviews.get('controlbox');
                const btn = await u.waitUntil(() => cbview.querySelector('.isacloud-update-btn'));

                btn.click();
                const busy = await u.waitUntil(() => cbview.querySelector('.isacloud-update-btn--updating'));
                expect(busy.getAttribute('aria-busy')).toBe('true');
                expect(busy.getAttribute('title')).toBe('Updating…');
                expect(reload).not.toHaveBeenCalled();

                busy.click(); // ignored while updating
                await u.waitUntil(() => reload.mock.calls.length === 1, 2000);
                await new Promise((resolve) => setTimeout(resolve, 400));
                expect(reload).toHaveBeenCalledOnce();
                expect(fake.mock.calls.filter(([url]) => String(url).includes('atualizar')).length).toBe(1);
                reload.mockRestore();
            },
        ),
    );
});

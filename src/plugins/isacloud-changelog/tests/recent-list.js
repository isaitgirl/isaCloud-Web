import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = {
    show_recent_list: true,
    view_mode: 'fullscreen',
    persistent_store: 'localStorage',
    whitelisted_plugins: ['converse-isacloud-changelog'],
};

/** @param {any} _converse */
async function getRecentList(_converse) {
    await mock.openControlBox(_converse);
    const controlbox = await u.waitUntil(() => _converse.chatboxviews.get('controlbox'));
    return u.waitUntil(() => controlbox.querySelector('converse-recent-list'));
}

/** @param {any} _converse */
const changelog = (_converse) => _converse.exports.isacloud_changelog;

/**
 * The tests share the browser storage. Start each one with the row visible,
 * whatever the previous test archived or read.
 * @param {any} _converse
 */
async function reset(_converse) {
    await u.waitUntil(() => changelog(_converse).changelog_state.ready);
    if (changelog(_converse).isArchived()) changelog(_converse).unarchiveChangelog();
}

/** @param {Element} list */
const row = (list) => list.querySelector('.recent-item--changelog');

/** @param {Element} list */
const items = (list) => list.querySelector('.recent-list__items');

/** @param {Element} list */
const chip = (list, label) =>
    Array.from(list.querySelectorAll('.recent-list__chip')).find((el) => el.textContent.trim() === label);

describe('The isaCloud changelog row', function () {
    it(
        'sits above the conversations, opens the view, marks itself read and archives from its own icon',
        mock.initConverse(converse, [], SETTINGS, async (_converse) => {
            await reset(_converse);
            const list = await getRecentList(_converse);
            const changelog_row = await u.waitUntil(() => row(list));

            expect(items(list).firstElementChild).toBe(changelog_row);
            expect(changelog_row.querySelector('.recent-item__name').textContent).toContain('What’s new in isaCloud');
            expect(changelog_row.querySelector('.recent-item__preview').textContent).toContain('v15-38');
            expect(changelog_row.classList.contains('unread')).toBe(true);
            expect(changelog_row.querySelector('.recent-item__new').textContent).toBe('New');

            // Only in the "All" filter.
            chip(list, 'Unread chats').click();
            await u.waitUntil(() => !row(list));
            list.querySelector('.recent-list__chip--all').click();
            await u.waitUntil(() => row(list));

            row(list).querySelector('.recent-item__link').click();
            const view = await u.waitUntil(() => document.querySelector('converse-isacloud-changelog'));
            await u.waitUntil(() => view?.hidden === false);

            expect(changelog(_converse).changelog_state.open).toBe(true);
            expect(view.querySelector('.isacloud-changelog__title').textContent).toContain('What’s new in isaCloud');
            expect(view.querySelectorAll('.isacloud-changelog__release').length).toBe(1);
            expect(view.querySelector('.isacloud-changelog__release-title').textContent).toContain('v15-38');
            await u.waitUntil(() => !row(list).classList.contains('unread'));

            view.querySelector('.isacloud-changelog__back').click();
            await u.waitUntil(() => !changelog(_converse).changelog_state.open);
            expect(view.hidden).toBe(true);

            row(list).querySelector('.recent-item__archive').click();
            await u.waitUntil(() => !row(list));
            expect(changelog(_converse).isArchived()).toBe(true);
        }),
    );

    it(
        'is still reachable from Settings → About when archived, and can be put back in the list',
        mock.initConverse(converse, [], SETTINGS, async (_converse) => {
            await reset(_converse);
            const list = await getRecentList(_converse);
            await u.waitUntil(() => row(list));

            row(list).querySelector('.recent-item__archive').click();
            await u.waitUntil(() => !row(list));

            const controlbox = _converse.chatboxviews.get('controlbox');
            const gear = await u.waitUntil(() => controlbox.querySelector('a.show-client-info'));
            gear.click();
            const modal = await u.waitUntil(() => document.querySelector('converse-user-settings-modal'));
            const about = await u.waitUntil(() => modal.querySelector('converse-isacloud-changelog-link'));
            about.querySelector('.isacloud-changelog-link__open').click();

            const view = await u.waitUntil(() => document.querySelector('converse-isacloud-changelog'));
            await u.waitUntil(() => view?.hidden === false);
            const unarchive = await u.waitUntil(() => view.querySelector('.isacloud-changelog__unarchive'));
            unarchive.click();

            await u.waitUntil(() => row(list));
            expect(changelog(_converse).isArchived()).toBe(false);
            expect(view.querySelector('.isacloud-changelog__unarchive')).toBeNull();
        }),
    );

    it(
        'does not show the empty state when the changelog is the only row',
        mock.initConverse(converse, [], SETTINGS, async (_converse) => {
            await reset(_converse);
            const list = await getRecentList(_converse);
            await u.waitUntil(() => row(list));
            expect(list.querySelector('.recent-list__empty')).toBeNull();
        }),
    );
});

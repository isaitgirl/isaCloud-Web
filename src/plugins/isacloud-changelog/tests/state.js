import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = {
    show_recent_list: true,
    view_mode: 'fullscreen',
    persistent_store: 'localStorage',
    whitelisted_plugins: ['converse-isacloud-changelog'],
};

describe('The isaCloud changelog state', function () {
    it(
        'starts with the current release unread, marks it read on open and can archive it',
        mock.initConverse(converse, [], SETTINGS, async (_converse) => {
            const { archiveChangelog, changelog_state, getChangelogItem, openChangelog, unarchiveChangelog } =
                _converse.exports.isacloud_changelog;

            await u.waitUntil(() => changelog_state.ready);

            const item = getChangelogItem();
            expect(item).not.toBeNull();
            expect(item.releases.map((r) => r.version)).toEqual([_converse.env.VERSION_NAME]);
            expect(item.unread).toBe(true);
            expect(item.date).toBeTruthy();

            openChangelog();
            expect(changelog_state.open).toBe(true);
            expect(getChangelogItem().unread).toBe(false);

            archiveChangelog();
            expect(getChangelogItem()).toBeNull();

            unarchiveChangelog();
            expect(getChangelogItem()).not.toBeNull();
        }),
    );
});

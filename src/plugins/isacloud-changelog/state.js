/**
 * @description
 *  isaCloud: the state behind the "Novidades do isaCloud" row and its
 *  conversation-like view. It mirrors the native apps: a first run shows only
 *  the current release, an update shows every release between the previous and
 *  the current version, and read/archived state is kept per account.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { Model, u } from '@converse/headless';
import { compareVersions, selectReleases } from './batch.js';
import { releases as all_releases } from './data.js';

/** Fired whenever the state below changes. */
export const CHANGELOG_EVENT = 'isacloud-changelog-changed';

/**
 * Shared, observable state. The row and the view listen to {@link CHANGELOG_EVENT}
 * and re-render; they never write these fields directly.
 */
export const changelog_state = Object.assign(new EventTarget(), {
    enabled: false,
    ready: false,
    open: false,
    current_version: '',
    from_version: '',
    to_version: '',
    first_run: false,
    read_version: '',
    archived_version: '',
    /** @type {import('./batch.js').ChangelogRelease[]} */
    releases: [],
});

/** @type {ChangelogStateModel|null} */
let model = null;

/** @type {string|null} */
let started_for = null;

/**
 * Persisted per account, like the conversation list's own model.
 */
class ChangelogStateModel extends Model {
    defaults() {
        return {
            last_run_version: '',
            batch_from: '',
            batch_to: '',
            first_run: false,
            read_version: '',
            archived_version: '',
        };
    }
}

function dispatchChange() {
    changelog_state.dispatchEvent(new Event(CHANGELOG_EVENT));
}

/**
 * Whether the current batch has been archived for this version.
 * @returns {boolean}
 */
export function isArchived() {
    return (
        !!changelog_state.to_version &&
        compareVersions(changelog_state.archived_version, changelog_state.to_version) >= 0
    );
}

/**
 * Whether there is something in the current batch the user has not opened yet.
 * @returns {boolean}
 */
export function isUnread() {
    return (
        !!changelog_state.to_version && compareVersions(changelog_state.read_version, changelog_state.to_version) < 0
    );
}

/**
 * Whether the row should appear in the conversation list.
 * @returns {boolean}
 */
export function isVisible() {
    return changelog_state.ready && !isArchived() && changelog_state.releases.length > 0;
}

// Read-only views of the same predicates, for templates that prefer properties.
Object.defineProperties(changelog_state, {
    archived: { get: isArchived },
    unread: { get: isUnread },
    visible: { get: isVisible },
});

/**
 * What the row needs to render, or null when it should not appear.
 * @returns {{releases: import('./batch.js').ChangelogRelease[], unread: boolean, date: string}|null}
 */
export function getChangelogItem() {
    if (!isVisible()) return null;
    return {
        releases: changelog_state.releases,
        unread: isUnread(),
        date: changelog_state.releases[0]?.date ?? '',
    };
}

/**
 * Compute the batch for this launch and persist the new `last_run_version`.
 * The batch itself stays stored, so a plain reload does not drop news that was
 * not read yet.
 * @param {ChangelogStateModel} state_model
 */
function recordLaunch(state_model) {
    const current = changelog_state.current_version;
    const previous = state_model.get('last_run_version') || '';

    let from_version = '';
    let to_version = '';
    let first_run = false;

    if (!previous) {
        // A new installation only receives the current release, not the history.
        first_run = true;
        to_version = current;
    } else {
        const comparison = compareVersions(current, previous);
        if (comparison > 0) {
            from_version = previous;
            to_version = current;
        } else if (comparison === 0) {
            // Same version: keep the batch recorded on the previous launch.
            from_version = state_model.get('batch_from') || '';
            to_version = state_model.get('batch_to') || '';
            first_run = !!state_model.get('first_run');
        } else {
            // Downgrade: do not try to show releases this build does not know.
            from_version = '';
            to_version = '';
        }
    }

    const selected = selectReleases(all_releases, {
        from: from_version,
        to: to_version,
        first_run,
    });

    u.safeSave(state_model, {
        last_run_version: current,
        batch_from: from_version,
        batch_to: to_version,
        first_run,
    });

    Object.assign(changelog_state, {
        from_version,
        to_version,
        first_run,
        read_version: state_model.get('read_version') || '',
        archived_version: state_model.get('archived_version') || '',
        releases: selected,
    });
}

/**
 * Start (or resume) the state for an account. Called after login. Safe to call
 * again on reconnects; it only reloads when the account changed.
 * @param {string} bare_jid
 * @returns {Promise<void>}
 */
export async function startChangelog(bare_jid) {
    if (!changelog_state.enabled || !bare_jid) return;
    if (started_for === bare_jid) return;

    stopChangelog();
    started_for = bare_jid;

    const id = `converse.isacloud-changelog-${bare_jid}`;
    const state_model = new ChangelogStateModel({ id });
    model = state_model;
    u.initStorage(state_model, id);

    await state_model.fetch({ promise: true }).catch(() => {
        // A storage failure still leaves the defaults in place.
    });

    // A logout while the storage was loading must not resurrect the state.
    if (model !== state_model) return;

    recordLaunch(state_model);
    changelog_state.ready = true;
    dispatchChange();
}

/**
 * Forget the in-memory state. The stored values stay under the account's key,
 * so logging back in restores the read/archived state.
 */
export function stopChangelog() {
    started_for = null;
    model = null;
    Object.assign(changelog_state, {
        ready: false,
        open: false,
        from_version: '',
        to_version: '',
        first_run: false,
        read_version: '',
        archived_version: '',
        releases: [],
    });
    dispatchChange();
}

/**
 * Open the view and mark the batch as read.
 */
export function openChangelog() {
    if (!changelog_state.enabled || !changelog_state.ready) return;

    if (changelog_state.to_version && isUnread() && model) {
        u.safeSave(model, { read_version: changelog_state.to_version });
        changelog_state.read_version = changelog_state.to_version;
    }

    changelog_state.open = true;
    dispatchChange();
}

export function closeChangelog() {
    if (!changelog_state.open) return;
    changelog_state.open = false;
    dispatchChange();
}

/**
 * Remove the row from the conversation list. The batch stays stored and is
 * still reachable from Settings → About; the next version shows it again.
 */
export function archiveChangelog() {
    if (!model || !changelog_state.to_version) return;
    u.safeSave(model, { archived_version: changelog_state.to_version });
    changelog_state.archived_version = changelog_state.to_version;
    dispatchChange();
}

/**
 * Bring the archived row back to the conversation list.
 */
export function unarchiveChangelog() {
    if (!model) return;
    u.safeSave(model, { archived_version: '' });
    changelog_state.archived_version = '';
    dispatchChange();
}

/**
 * Shared with the specs, which need the same module state as the plugin.
 */
export const changelog_api = {
    archiveChangelog,
    closeChangelog,
    getChangelogItem,
    isArchived,
    isUnread,
    isVisible,
    openChangelog,
    startChangelog,
    stopChangelog,
    unarchiveChangelog,
    changelog_state,
    CHANGELOG_EVENT,
};

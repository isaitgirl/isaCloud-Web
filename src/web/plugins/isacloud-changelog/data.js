/**
 * @description
 *  isaCloud: the user-facing changelog, embedded in the bundle. It is generated
 *  from `CHANGELOG-USERS.md` by `scripts/generate-changelog-json.mjs`; the
 *  release build checks that the committed file is up to date.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import changelog from './changelog.json';

/** @typedef {import('./batch.js').ChangelogRelease} ChangelogRelease */

/** @type {ChangelogRelease[]} Newest first, as written in the Markdown. */
export const releases = changelog.releases;

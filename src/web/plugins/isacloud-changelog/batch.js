/**
 * @description
 *  isaCloud: pure helpers that decide which changelog releases are shown to the
 *  user. Versions are compared numerically, so `v15-38` is newer than
 *  `v15-37`; a version outside the expected format falls back to a
 *  lexicographic comparison instead of throwing.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */

/**
 * @typedef {Object} ChangelogItem
 * @property {string} title
 * @property {string} text
 */

/**
 * @typedef {Object} ChangelogRelease
 * @property {string} version
 * @property {string} date
 * @property {ChangelogItem[]} items
 */

/**
 * Parse a version into comparable numeric parts. Accepts `v15-38`, `15-38`,
 * `2.21.0-63` and `2.21.0`. A missing release part counts as zero.
 * @param {string} [version]
 * @returns {number[]|null}
 */
export function parseVersion(version) {
    if (typeof version !== 'string') return null;

    const stripped = version.trim().replace(/^v/i, '');
    if (!stripped) return null;

    const [base, release] = stripped.split('-');
    const parts = base.split('.');
    if (!parts.length || !parts.every((part) => /^\d+$/.test(part))) return null;

    if (release !== undefined && !/^\d+$/.test(release)) return null;

    return [...parts.map(Number), release === undefined ? 0 : Number(release)];
}

/**
 * Compare two version names. A malformed version falls back to a plain string
 * comparison, so the UI never breaks on unexpected data.
 * @param {string} [a]
 * @param {string} [b]
 * @returns {number}
 */
export function compareVersions(a, b) {
    const parsed_a = parseVersion(a);
    const parsed_b = parseVersion(b);

    if (!parsed_a || !parsed_b) {
        return String(a ?? '').localeCompare(String(b ?? ''));
    }

    const length = Math.max(parsed_a.length, parsed_b.length);
    for (let i = 0; i < length; i++) {
        const result = (parsed_a[i] ?? 0) - (parsed_b[i] ?? 0);
        if (result !== 0) return result < 0 ? -1 : 1;
    }
    return 0;
}

/**
 * Releases newer than `from` and at most `to`, newest first. On a first run (or
 * when there is no lower bound) only the latest release at or before `to` is
 * returned, as the native apps do: a new installation must not receive the
 * whole history.
 * @param {ChangelogRelease[]} releases
 * @param {{from?: string, to?: string, first_run?: boolean}} options
 * @returns {ChangelogRelease[]}
 */
export function selectReleases(releases, { from = '', to = '', first_run = false } = {}) {
    if (!to) return [];

    const sorted = [...releases].sort((a, b) => compareVersions(b.version, a.version));

    if (first_run || !from) {
        const latest = sorted.find((release) => compareVersions(release.version, to) <= 0);
        return latest ? [latest] : [];
    }

    return sorted.filter(
        (release) => compareVersions(release.version, from) > 0 && compareVersions(release.version, to) <= 0,
    );
}

/**
 * A short label for a batch: one version, or the range from the oldest to the
 * newest release in it.
 * @param {ChangelogRelease[]} releases Newest first.
 * @returns {string}
 */
export function formatVersionLabel(releases) {
    if (!releases.length) return '';
    if (releases.length === 1) return releases[0].version;

    const oldest = releases[releases.length - 1].version;
    const newest = releases[0].version;
    return `${oldest} – ${newest}`;
}

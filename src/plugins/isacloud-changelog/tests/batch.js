import { compareVersions, formatVersionLabel, parseVersion, selectReleases } from '../batch.js';

const release = (version, date = '01/01/2026') => ({ version, date, items: [{ title: '', text: version }] });

describe('The isaCloud changelog batch', function () {
    it('parses the versions used by the fork and by upstream', function () {
        expect(parseVersion('v15-38')).toEqual([15, 38]);
        expect(parseVersion('15-38')).toEqual([15, 38]);
        expect(parseVersion('2.21.0-63')).toEqual([2, 21, 0, 63]);
        expect(parseVersion('2.21.0')).toEqual([2, 21, 0, 0]);
        expect(parseVersion('')).toBeNull();
        expect(parseVersion(undefined)).toBeNull();
        expect(parseVersion('v15-beta')).toBeNull();
    });

    it('compares versions numerically, not lexicographically', function () {
        expect(compareVersions('v15-38', 'v15-37')).toBeGreaterThan(0);
        expect(compareVersions('v15-37', 'v15-38')).toBeLessThan(0);
        expect(compareVersions('v15-38', 'v15-38')).toBe(0);
        expect(compareVersions('v15-9', 'v15-10')).toBeLessThan(0);
        expect(compareVersions('2.21.0-63', '2.21.0-62')).toBeGreaterThan(0);
    });

    it('falls back to a string comparison for a malformed version', function () {
        expect(compareVersions('', 'v15-38')).toBeLessThan(0);
        expect(compareVersions('v15-38', '')).toBeGreaterThan(0);
        expect(() => compareVersions('nonsense', 'v15-38')).not.toThrow();
    });

    it('shows only the current release on a first run', function () {
        const releases = [release('v15-38'), release('v15-37'), release('v15-36')];
        expect(selectReleases(releases, { to: 'v15-38', first_run: true })).toEqual([release('v15-38')]);
        expect(selectReleases(releases, { from: '', to: 'v15-37' })).toEqual([release('v15-37')]);
    });

    it('shows every release between the previous and the current version', function () {
        const releases = [
            release('v15-38'),
            release('v15-37'),
            release('v15-36'),
            release('v15-35'),
            release('v15-34'),
        ];
        expect(selectReleases(releases, { from: 'v15-35', to: 'v15-38' }).map((r) => r.version)).toEqual([
            'v15-38',
            'v15-37',
            'v15-36',
        ]);
    });

    it('shows nothing on a downgrade or when the version is unknown', function () {
        const releases = [release('v15-38'), release('v15-37')];
        expect(selectReleases(releases, { from: '', to: '' })).toEqual([]);
        expect(selectReleases(releases, { from: '', to: 'v15-30' })).toEqual([]);
    });

    it('does not mutate the input and returns releases newest first', function () {
        const releases = [release('v15-36'), release('v15-38'), release('v15-37')];
        const copy = [...releases];
        expect(selectReleases(releases, { from: 'v15-36', to: 'v15-38' }).map((r) => r.version)).toEqual([
            'v15-38',
            'v15-37',
        ]);
        expect(releases).toEqual(copy);
    });

    it('labels one version and a range', function () {
        expect(formatVersionLabel([release('v15-38')])).toBe('v15-38');
        expect(formatVersionLabel([release('v15-38'), release('v15-37')])).toBe('v15-37 – v15-38');
        expect(formatVersionLabel([])).toBe('');
    });
});

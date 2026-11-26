import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-conference'] };
const JID = 'romeo@montague.lit';
const OTHER_JID = 'juliet@capulet.lit';
const KEY = 'isacloud-conference';
const BASE = 'https://meet.isacloud.cc';

/** A host URL one hour from now. */
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
/** An expiry one hour ago. */
const past = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

/**
 * @param {string} room_id
 * @param {Object} [overrides]
 */
function record(room_id, overrides = {}) {
    return {
        hostURL: `${BASE}/u/${room_id}/?token=secret&pk=1`,
        hostKey: 'host-key',
        expiresAt: future(),
        savedAt: Date.now(),
        ...overrides,
    };
}

/**
 * @param {Record<string, Record<string, any>>} accounts
 */
function seed(accounts) {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, accounts }));
}

/**
 * @param {any} _converse
 * @returns {any}
 */
const store = (_converse) => _converse.exports.isacloud_conference;

describe('The conference storage', function () {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it(
        'saves a room for one account and reads its host URL back',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { saveRoom, getHostURL } = store(_converse);
            saveRoom(JID, { roomID: 'room1', ...record('room1') }, BASE);

            expect(getHostURL(JID, 'room1', BASE)).toBe(`${BASE}/u/room1/?token=secret&pk=1`);
            const data = JSON.parse(localStorage.getItem(KEY));
            expect(data.version).toBe(1);
            expect(Object.keys(data.accounts)).toEqual([JID]);
            expect(data.accounts[JID].room1.hostKey).toBe('host-key');
        }),
    );

    it(
        'ignores and prunes an expired room',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { saveRoom, getHostURL } = store(_converse);
            seed({
                [JID]: {
                    old: record('old', { hostURL: `${BASE}/u/old/?token=old&pk=1`, expiresAt: past() }),
                    fresh: record('fresh'),
                },
            });
            expect(getHostURL(JID, 'old', BASE)).toBeNull();
            expect(getHostURL(JID, 'fresh', BASE)).toBeTruthy();

            // Saving another room rewrites the key without the expired one.
            saveRoom(JID, { roomID: 'new', ...record('new') }, BASE);
            const data = JSON.parse(localStorage.getItem(KEY));
            expect(Object.keys(data.accounts[JID]).sort()).toEqual(['fresh', 'new']);
        }),
    );

    it(
        'does not show one account the rooms of another',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { saveRoom, getHostURL } = store(_converse);
            saveRoom(JID, { roomID: 'room1', ...record('room1') }, BASE);
            expect(getHostURL(OTHER_JID, 'room1', BASE)).toBeNull();
        }),
    );

    it(
        'returns nothing for corrupted JSON',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { getHostURL } = store(_converse);
            localStorage.setItem(KEY, '{not json');
            expect(getHostURL(JID, 'room1', BASE)).toBeNull();

            localStorage.setItem(KEY, JSON.stringify({ version: 1, accounts: { [JID]: { room1: { nope: true } } } }));
            expect(getHostURL(JID, 'room1', BASE)).toBeNull();
        }),
    );

    it(
        'discards a host URL on another host',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { getHostURL } = store(_converse);
            seed({
                [JID]: {
                    room1: record('room1', { hostURL: 'https://evil.example/u/room1/?token=secret' }),
                },
            });
            expect(getHostURL(JID, 'room1', BASE)).toBeNull();

            // The right host, but not the host page of this room.
            seed({ [JID]: { room1: record('room1', { hostURL: `${BASE}/join/room1` }) } });
            expect(getHostURL(JID, 'room1', BASE)).toBeNull();
        }),
    );

    it(
        'keeps at most twenty rooms per account, dropping the oldest',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { saveRoom, getHostURL } = store(_converse);
            const rooms = {};
            for (let i = 0; i < 21; i++) {
                rooms[`room${i}`] = record(`room${i}`, { savedAt: i + 1 });
            }
            seed({ [JID]: rooms });

            // Writing prunes the seeded rooms too.
            saveRoom(JID, { roomID: 'roomX', ...record('roomX') }, BASE);
            expect(getHostURL(JID, 'room0', BASE)).toBeNull();
            expect(getHostURL(JID, 'room1', BASE)).toBeNull();
            expect(getHostURL(JID, 'room20', BASE)).toBeTruthy();
            expect(getHostURL(JID, 'roomX', BASE)).toBeTruthy();
        }),
    );
});

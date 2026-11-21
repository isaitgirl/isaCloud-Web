import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-conference'] };
const BASE = 'https://meet.isacloud.cc';

/**
 * @param {any} _converse
 * @returns {any}
 */
const links = (_converse) => _converse.exports.isacloud_conference;

describe('The video conference links', function () {
    it(
        'accepts the public link of a room, including an upper-case host',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { roomIDFromURL } = links(_converse);
            expect(roomIDFromURL(`${BASE}/join/abc_123-XYZ`, BASE)).toBe('abc_123-XYZ');
            expect(roomIDFromURL('https://MEET.ISACLOUD.CC/join/room1', BASE)).toBe('room1');
        }),
    );

    it(
        'rejects a scheme, port, credentials, query, fragment, trailing slash or a look-alike host',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { roomIDFromURL } = links(_converse);
            const rejected = [
                'http://meet.isacloud.cc/join/room1',
                'https://meet.isacloud.cc:8443/join/room1',
                'https://user:pass@meet.isacloud.cc/join/room1',
                'https://meet.isacloud.cc/join/room1?x=1',
                'https://meet.isacloud.cc/join/room1#x',
                'https://meet.isacloud.cc/join/room1?',
                'https://meet.isacloud.cc/join/room1#',
                'https://meet.isacloud.cc/join/room1/',
                'https://meet.isacloud.cc.evil.example/join/room1',
                'https://evil.example/join/room1',
                'https://meet.isacloud.cc/join/',
                'https://meet.isacloud.cc/u/room1/?token=x',
            ];
            for (const url of rejected) expect(roomIDFromURL(url, BASE)).toBeNull();
        }),
    );

    it(
        "uses the configured base's host, not a hardcoded one",
        mock.initConverse(
            converse,
            [],
            { ...SETTINGS, isacloud_conference_url: 'https://meet.example.org/' },
            async function (_converse) {
                const { roomIDFromURL, isMeetURL } = links(_converse);
                expect(roomIDFromURL('https://meet.example.org/join/room1', 'https://meet.example.org/')).toBe('room1');
                expect(roomIDFromURL('https://meet.isacloud.cc/join/room1', 'https://meet.example.org/')).toBeNull();
                expect(isMeetURL('https://meet.example.org/u/room1/?token=x', 'https://meet.example.org')).toBe(true);
            },
        ),
    );

    it(
        'accepts a host URL only when it is https on the service host without credentials',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { isMeetURL } = links(_converse);
            expect(isMeetURL('https://meet.isacloud.cc/u/room1/?token=secret&pk=1', BASE)).toBe(true);
            expect(isMeetURL('https://MEET.ISACLOUD.CC/u/room1/', BASE)).toBe(true);
            expect(isMeetURL('http://meet.isacloud.cc/u/room1/?token=secret', BASE)).toBe(false);
            expect(isMeetURL('https://user:pass@meet.isacloud.cc/u/room1/', BASE)).toBe(false);
            expect(isMeetURL('https://meet.isacloud.cc.evil.example/u/room1/', BASE)).toBe(false);
        }),
    );
});

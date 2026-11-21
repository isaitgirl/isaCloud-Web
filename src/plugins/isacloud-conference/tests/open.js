import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { stx, u } = converse.env;

const BASE = 'https://meet.isacloud.cc';
const ROOM_ID = 'room1';
const ROOM_URL = `${BASE}/join/${ROOM_ID}`;
const HOST_URL = `${BASE}/u/${ROOM_ID}/?token=secret-token&pk=1`;
const CONTACT_JID = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/**
 * @param {any} _converse
 * @returns {Promise<HTMLElement>}
 */
async function receiveLink(_converse) {
    await mock.waitForRoster(_converse, 'current');
    await mock.openChatBoxFor(_converse, CONTACT_JID);
    _converse.handleMessageStanza(stx`<message
            from="${CONTACT_JID}"
            to="${_converse.api.connection.get().jid}"
            type="chat"
            id="${u.getUniqueId()}"
            xmlns="jabber:client"><body>Join ${ROOM_URL}</body></message>`);
    const view = _converse.chatboxviews.get(CONTACT_JID);
    await u.waitUntil(() => view.querySelector('.chat-msg__text a'));
    return view;
}

/**
 * Stores a host URL for the account, as creating a conference would.
 * @param {any} _converse
 * @param {string} host_url
 */
function seedHostURL(_converse, host_url) {
    const bare_jid = _converse.session.get('bare_jid');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem(
        'isacloud-conference',
        JSON.stringify({
            version: 1,
            accounts: {
                [bare_jid]: {
                    [ROOM_ID]: { hostURL: host_url, hostKey: 'host-key', expiresAt, savedAt: Date.now() },
                },
            },
        }),
    );
}

/**
 * @param {Element} view
 * @returns {HTMLAnchorElement}
 */
function link(view) {
    return /** @type {HTMLAnchorElement} */ (view.querySelector('.chat-msg__text a'));
}

/** @param {HTMLElement} el */
function click(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-conference'] };

describe('Opening a video conference link from a message', function () {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it(
        'opens the host URL when the account has a valid one for the room',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const view = await receiveLink(_converse);
            seedHostURL(_converse, HOST_URL);
            const confirm = vi.spyOn(_converse.api, 'confirm').mockResolvedValue(true);
            const open = vi.spyOn(window, 'open').mockReturnValue(null);

            click(link(view));

            await u.waitUntil(() => open.mock.calls.length);
            expect(open).toHaveBeenCalledWith(HOST_URL, '_blank', 'noopener');
            // The dialog shows the public link, never the token-bearing host URL.
            expect(confirm).toHaveBeenCalledWith('Open external link?', [
                'This link will take you to meet.isacloud.cc',
                ROOM_URL,
            ]);
            expect(JSON.stringify(confirm.mock.calls)).not.toContain('secret-token');
        }),
    );

    it(
        'opens the public page when there is no host URL for the account',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const view = await receiveLink(_converse);
            vi.spyOn(_converse.api, 'confirm').mockResolvedValue(true);
            const open = vi.spyOn(window, 'open').mockReturnValue(null);

            click(link(view));

            await u.waitUntil(() => open.mock.calls.length);
            expect(open).toHaveBeenCalledWith(ROOM_URL, '_blank', 'noopener');
        }),
    );

    it(
        'shows the public link in the confirmation even when the host URL exists',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const view = await receiveLink(_converse);
            seedHostURL(_converse, HOST_URL);
            const confirm = vi.spyOn(_converse.api, 'confirm').mockResolvedValue(false);
            const open = vi.spyOn(window, 'open').mockReturnValue(null);

            click(link(view));

            await u.waitUntil(() => confirm.mock.calls.length);
            expect(confirm.mock.calls[0][1]).toEqual(['This link will take you to meet.isacloud.cc', ROOM_URL]);
            expect(open).not.toHaveBeenCalled();
        }),
    );

    it(
        'still swaps the target when confirm_external_links is off',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { ...SETTINGS, confirm_external_links: false },
            async function (_converse) {
                const view = await receiveLink(_converse);
                seedHostURL(_converse, HOST_URL);
                const confirm = vi.spyOn(_converse.api, 'confirm');
                const open = vi.spyOn(window, 'open').mockReturnValue(null);

                click(link(view));

                await u.waitUntil(() => open.mock.calls.length);
                expect(open).toHaveBeenCalledWith(HOST_URL, '_blank', 'noopener');
                expect(confirm).not.toHaveBeenCalled();
            },
        ),
    );
});

import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-conference'],
    allow_non_roster_messaging: true,
    notes_to_self: true,
};
const CONTACT_JID = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
const BASE = 'https://meet.isacloud.cc';
const TOKEN = 'secret-token';
const ROOM = {
    roomID: 'abc123',
    roomURL: `${BASE}/join/abc123`,
    hostURL: `${BASE}/u/abc123/?token=${TOKEN}&pk=1`,
    hostKey: 'host-key',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

/** @param {number} status @param {Object} [body] */
function response(status, body = {}) {
    return new Response(JSON.stringify(body), { status });
}

/** The calls the plugin made to the meet-api, ignoring other fetches (emoji data). */
const apiCalls = (/** @type {any} */ fake) =>
    fake.mock.calls.filter(([url]) => String(url).includes('/meet-api/v1/rooms'));

/**
 * @param {any} _converse
 * @returns {Promise<HTMLElement>}
 */
async function openChat(_converse) {
    await mock.waitForRoster(_converse, 'current', 1);
    await mock.openChatBoxFor(_converse, CONTACT_JID);
    return _converse.chatboxviews.get(CONTACT_JID);
}

/**
 * @param {HTMLElement} view
 * @returns {Promise<HTMLElement>}
 */
function conferenceButton(view) {
    return u.waitUntil(() => view.querySelector('.toolbar-buttons .start-conference'));
}

describe('Creating a video conference', function () {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it(
        'posts the account name, puts the public link in the composer and shows a notice',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const fake = vi.fn(async (/** @type {any} */ input) => {
                const url = String(input);
                if (url.includes('/meet-api/v1/rooms')) return response(201, ROOM);
                // `sendMessage` loads the emoji data; an empty set keeps it quiet.
                if (url.includes('emoji.json')) return response(200, {});
                return response(404);
            });
            vi.stubGlobal('fetch', fake);
            const open = vi.spyOn(window, 'open');
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});

            const view = await openChat(_converse);
            const button = await conferenceButton(view);
            // The audio call button is added by the Jingle UI before this plugin,
            // so the camera sits right after the phone.
            expect(button.previousElementSibling.classList.contains('start-call')).toBe(true);
            button.click();

            await u.waitUntil(() => toast.mock.calls.length);

            expect(apiCalls(fake).length).toBe(1);
            const [url, init] = apiCalls(fake)[0];
            expect(String(url)).toBe(`${BASE}/meet-api/v1/rooms`);
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
            expect(init.credentials).toBe('omit');
            expect(init.mode).toBe('cors');
            expect(JSON.parse(init.body)).toEqual({ hostName: 'Romeo' });

            // The host enters by clicking the link in the message, so creating
            // the room must not open anything.
            expect(open).not.toHaveBeenCalled();

            const bare_jid = _converse.session.get('bare_jid');
            const host_toast = toast.mock.calls.find(([name]) => name === 'conference-host-link');
            expect(host_toast).toBeTruthy();
            expect(host_toast[1]).toEqual({
                type: 'info',
                title: 'Video conference',
                body: 'Host link sent to you!',
                placement: 'composer',
                appearance: 'light',
                action: { label: 'View', handler: expect.any(Function) },
            });

            // The host link is also a note to ourselves, marked unread so that
            // it brings the "Notes to self" chat into the conversation list.
            const note_chat = _converse.state.chatboxes.get(bare_jid);
            const note = note_chat.messages.last();
            expect(note.get('body')).toBe(`This is the link to access your new conference:\n${ROOM.hostURL}`);
            expect(note_chat.get('num_unread')).toBe(1);
            expect(note_chat.get('first_unread_id')).toBe(note.get('id'));

            const trigger = vi.spyOn(_converse.api, 'trigger').mockImplementation(() => {});
            host_toast[1].action.handler();
            expect(trigger).toHaveBeenCalledWith('openConversation', { 'view': 'chat', 'jid': bare_jid });

            await u.waitUntil(() => view.model.get('draft')?.includes(ROOM.roomURL));
            const draft = view.model.get('draft');
            expect(draft).toContain(`Access the video conference via the link: ${ROOM.roomURL}`);
            expect(draft).not.toContain(TOKEN);
            expect(mock.composerText(view)).toContain(ROOM.roomURL);
            expect(mock.composerText(view)).not.toContain(TOKEN);

            const { getHostURL } = _converse.exports.isacloud_conference;
            expect(getHostURL(bare_jid, ROOM.roomID, BASE)).toBe(ROOM.hostURL);
        }),
    );

    it(
        'shows a notice and inserts nothing when the API answers 429 or 502',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const view = await openChat(_converse);
            const button = await conferenceButton(view);

            for (const status of [429, 502]) {
                vi.stubGlobal(
                    'fetch',
                    vi.fn(async (/** @type {any} */ input) =>
                        String(input).includes('/meet-api/v1/rooms') ? response(status) : response(404),
                    ),
                );
                const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});

                button.click();
                await u.waitUntil(() => toast.mock.calls.length);
                expect(toast).toHaveBeenCalledWith('conference-error', {
                    type: 'danger',
                    title: 'Video conference',
                    body: 'Could not create the conference. Please try again.',
                });
                expect(view.model.get('draft') ?? '').not.toContain(ROOM.roomURL);
                toast.mockRestore();
            }
            expect(view.model.get('draft') ?? '').not.toContain(ROOM.roomURL);
        }),
    );

    it(
        'shows a notice and inserts nothing when the request times out',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            vi.stubGlobal(
                'fetch',
                vi.fn((/** @type {any} */ input) =>
                    String(input).includes('/meet-api/v1/rooms')
                        ? Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))
                        : Promise.resolve(response(404)),
                ),
            );
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});

            const view = await openChat(_converse);
            (await conferenceButton(view)).click();

            await u.waitUntil(() => toast.mock.calls.length);
            expect(toast.mock.calls[0][1].body).toBe('Could not create the conference. Please try again.');
            expect(view.model.get('draft') ?? '').not.toContain(ROOM.roomURL);
        }),
    );

    it(
        'creates only one room when the button is clicked twice before the answer',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            /** @type {(value: any) => void} */
            let resolve;
            const fake = vi.fn((/** @type {any} */ input) =>
                String(input).includes('/meet-api/v1/rooms')
                    ? new Promise((r) => (resolve = r))
                    : Promise.resolve(response(404)),
            );
            vi.stubGlobal('fetch', fake);
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});

            const view = await openChat(_converse);
            const button = await conferenceButton(view);
            button.click();
            button.click();

            expect(apiCalls(fake)).toHaveLength(1);
            resolve(response(201, ROOM));
            await u.waitUntil(() => toast.mock.calls.length);
            expect(apiCalls(fake)).toHaveLength(1);
            await u.waitUntil(() => view.model.get('draft')?.includes(ROOM.roomURL));
        }),
    );
});

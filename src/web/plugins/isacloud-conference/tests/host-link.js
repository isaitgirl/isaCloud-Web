import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const BASE = 'https://meet.isacloud.cc';
const TOKEN = 'secret-token';
const ROOM = {
    roomID: 'abc123',
    roomURL: `${BASE}/join/abc123`,
    hostURL: `${BASE}/u/abc123/?token=${TOKEN}&pk=1`,
    hostKey: 'host-key',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};
const CONTACT_JID = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-conference', 'converse-recent-list'],
    allow_non_roster_messaging: true,
    notes_to_self: true,
    show_recent_list: true,
    view_mode: 'fullscreen',
};

/** @param {number} status @param {Object} [body] */
function response(status, body = {}) {
    return new Response(JSON.stringify(body), { status });
}

/** @param {any} fake */
const apiCalls = (fake) => fake.mock.calls.filter(([url]) => String(url).includes('/meet-api/v1/rooms'));

/**
 * @param {any} _converse
 * @returns {Promise<HTMLElement>}
 */
async function openChat(_converse) {
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

/**
 * @param {any} _converse
 * @returns {Promise<HTMLElement>}
 */
async function getRecentList(_converse) {
    await mock.openControlBox(_converse);
    const controlbox = await u.waitUntil(() => _converse.chatboxviews.get('controlbox'));
    return u.waitUntil(() => controlbox.querySelector('converse-recent-list'));
}

/** @param {any} _converse */
const currentList = (_converse) => _converse.chatboxviews.get('controlbox').querySelector('converse-recent-list');

/**
 * @param {Element} list
 * @param {string} jid
 */
const rowOf = (list, jid) => list.querySelector(`.recent-item[data-jid="${jid}"]`);

/**
 * Creates the room the meet-api answers with and stubs the notice, then clicks
 * the conference button of the contact's chat.
 * @param {HTMLElement} view
 * @param {any} toast
 * @returns {Promise<any>} The fetch mock, to inspect the meet-api calls.
 */
async function createConference(view, toast) {
    const fake = vi.fn(async (/** @type {any} */ input) => {
        const url = String(input);
        if (url.includes('/meet-api/v1/rooms')) return response(201, ROOM);
        // `sendMessage` loads the emoji data; an empty set keeps it quiet.
        if (url.includes('emoji.json')) return response(200, {});
        return response(404);
    });
    vi.stubGlobal('fetch', fake);
    (await conferenceButton(view)).click();
    await u.waitUntil(() => toast.mock.calls.some(([name]) => name.startsWith('conference-')));
    return fake;
}

describe('The conference host link note', function () {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it(
        'sends the host link to "Notes to self", which then appears unread in the conversation list',
        mock.initConverse(converse, ['chatBoxesFetched'], { ...SETTINGS, i18n: 'pt_BR' }, async function (_converse) {
            const bare_jid = _converse.bare_jid;
            await mock.waitForRoster(_converse, 'current', 1);

            // The chat exists without messages, so it is only in the contacts view.
            const notes_chat = await _converse.api.chats.get(bare_jid, {}, true);
            await notes_chat.initialized;
            const list = await getRecentList(_converse);
            expect(rowOf(list, bare_jid)).toBeNull();

            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            const view = await openChat(_converse);
            await createConference(view, toast);

            const host_toast = toast.mock.calls.find(([name]) => name === 'conference-host-link');
            expect(host_toast).toBeTruthy();
            expect(host_toast[1].type).toBe('info');
            expect(host_toast[1].title).toBe('Vídeo conferência');
            expect(host_toast[1].body).toBe('Link de anfitrião enviado para você mesmo!');
            expect(host_toast[1].placement).toBe('composer');
            expect(host_toast[1].appearance).toBe('light');
            expect(host_toast[1].action.label).toBe('Ver');

            const note = notes_chat.messages.last();
            expect(note.get('body')).toBe(`Este é o link para acessar sua nova conferência:\n${ROOM.hostURL}`);
            expect(notes_chat.get('num_unread')).toBe(1);
            expect(notes_chat.get('first_unread_id')).toBe(note.get('id'));

            // The unread note is what brings the chat into the list.
            const row = await u.waitUntil(() => rowOf(currentList(_converse), bare_jid));
            expect(row.classList.contains('unread')).toBe(true);
            expect(row.querySelector('.recent-item__unread').textContent.trim()).toBe('1');

            // Creating the conference does not open the chat, so the note stays unread.
            expect(notes_chat.get('num_unread')).toBe(1);
            expect(rowOf(currentList(_converse), bare_jid)).not.toBeNull();
        }),
    );

    it(
        'leaves the note unread and opens the chat from its toast action',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const bare_jid = _converse.bare_jid;
            await mock.waitForRoster(_converse, 'current', 1);

            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            await getRecentList(_converse);
            const view = await openChat(_converse);
            await createConference(view, toast);

            const notes_chat = _converse.state.chatboxes.get(bare_jid);
            const note = notes_chat.messages.last();
            expect(note.get('body')).toBe(`This is the link to access your new conference:\n${ROOM.hostURL}`);
            expect(notes_chat.get('num_unread')).toBe(1);
            await u.waitUntil(() => rowOf(currentList(_converse), bare_jid));

            // The mocked toast keeps the action, so the test can click it.
            const host_toast = toast.mock.calls.find(([name]) => name === 'conference-host-link');
            expect(host_toast[1].placement).toBe('composer');
            expect(host_toast[1].appearance).toBe('light');
            expect(host_toast[1].action.label).toBe('View');
            const trigger = vi.spyOn(_converse.api, 'trigger').mockImplementation(() => {});
            host_toast[1].action.handler();
            expect(trigger).toHaveBeenCalledWith('openConversation', { 'view': 'chat', 'jid': bare_jid });
        }),
    );

    it(
        'marks the new note unread even when the chat already has messages and is in the list',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const bare_jid = _converse.bare_jid;
            await mock.waitForRoster(_converse, 'current', 1);
            await getRecentList(_converse);

            const notes_chat = await _converse.api.chats.get(bare_jid, {}, true);
            await notes_chat.initialized;
            await _converse.handleMessageStanza(mock.createChatMessage(_converse, bare_jid, 'An older note'));
            await u.waitUntil(() => notes_chat.messages.length === 1);
            // Treat the older note as read, so only the new one is unread.
            u.safeSave(notes_chat, { num_unread: 0 });
            await u.waitUntil(() => rowOf(currentList(_converse), bare_jid));

            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            const view = await openChat(_converse);
            await createConference(view, toast);

            const note = notes_chat.messages.last();
            expect(note.get('body')).toContain(ROOM.hostURL);
            expect(notes_chat.get('num_unread')).toBe(1);
            expect(notes_chat.get('first_unread_id')).toBe(note.get('id'));
            await u.waitUntil(() => rowOf(currentList(_converse), bare_jid)?.classList.contains('unread'));
        }),
    );

    it(
        'keeps the conference notice when the note cannot be sent',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const bare_jid = _converse.bare_jid;
            await mock.waitForRoster(_converse, 'current', 1);

            const notes_chat = await _converse.api.chats.get(bare_jid, {}, true);
            await notes_chat.initialized;
            // `sendMessage` resolving without a message is one of the failure modes.
            vi.spyOn(notes_chat, 'sendMessage').mockResolvedValue(undefined);

            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            const view = await openChat(_converse);
            const fake = await createConference(view, toast);

            expect(toast).toHaveBeenCalledWith('conference-created', {
                type: 'info',
                title: 'Video conference',
                body: 'Conference created. The link is in the message field.',
            });
            expect(toast.mock.calls.some(([name]) => name === 'conference-error')).toBe(false);
            expect(notes_chat.messages.length).toBe(0);
            expect(notes_chat.get('num_unread')).toBe(0);
            await u.waitUntil(() => view.model.get('draft')?.includes(ROOM.roomURL));
            expect(apiCalls(fake)).toHaveLength(1);
        }),
    );
});

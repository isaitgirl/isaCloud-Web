import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { stx, u } = converse.env;

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-polls'],
    blacklisted_plugins: ['converse-voice-messages'],
    visible_toolbar_buttons: { fileupload: false, location: false },
};
const MUC_JID = 'lounge@montague.lit';

/**
 * @param {any} _converse
 * @returns {Promise<{view: HTMLElement, model: any}>}
 */
async function openRoom(_converse) {
    await mock.openAndEnterMUC(_converse, MUC_JID, 'romeo');
    const view = _converse.chatboxviews.get(MUC_JID);
    return { view, model: view.model };
}

/**
 * @param {any} _converse
 * @param {Element|any} stanza
 */
function receive(_converse, stanza) {
    _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));
}

/**
 * @param {any} _converse
 * @param {string} nick
 * @param {string} id
 * @param {string} stanza_id
 * @returns {import('strophe.js').Builder}
 */
function pollFrom(_converse, nick, id, stanza_id) {
    return stx`<message xmlns="jabber:client" type="groupchat" id="${id}" from="${MUC_JID}/${nick}" to="${_converse.jid}">
        <body>📊 Poll: Almoço? 1️⃣ Pizza 2️⃣ Sushi</body>
        <poll xmlns="urn:fluux:poll:0">
            <title>Almoço?</title>
            <option emoji="1️⃣">Pizza</option>
            <option emoji="2️⃣">Sushi</option>
        </poll>
        <stanza-id xmlns="urn:xmpp:sid:0" id="${stanza_id}" by="${MUC_JID}"/>
    </message>`;
}

/**
 * @param {any} _converse
 * @param {string} nick
 * @param {string} stanza_id
 * @param {string} emoji
 * @returns {import('strophe.js').Builder}
 */
function reactionFrom(_converse, nick, stanza_id, emoji) {
    return stx`<message xmlns="jabber:client" type="groupchat" from="${MUC_JID}/${nick}" to="${_converse.jid}">
        <reactions xmlns="urn:xmpp:reactions:0" id="${stanza_id}"><reaction>${emoji}</reaction></reactions>
    </message>`;
}

/**
 * @param {any} _converse
 * @param {string} nick
 * @param {string} message_id
 * @returns {import('strophe.js').Builder}
 */
function closeFrom(_converse, nick, message_id) {
    return stx`<message xmlns="jabber:client" type="groupchat" from="${MUC_JID}/${nick}" to="${_converse.jid}">
        <body>📊 Poll encerrada: Almoço?</body>
        <poll-closed xmlns="urn:fluux:poll:0" message-id="${message_id}">
            <title>Almoço?</title>
            <tally emoji="1️⃣" label="Pizza" count="1" voters="juliet"/>
            <tally emoji="2️⃣" label="Sushi" count="1" voters="benvolio"/>
        </poll-closed>
    </message>`;
}

/**
 * @param {any} send
 * @returns {Element[]}
 */
function sentClosedStanzas(send) {
    return send.mock.calls
        .map(([stanza]) => (stanza instanceof Element ? stanza : stanza.tree()))
        .filter((el) => el.querySelector?.('poll-closed'));
}

/**
 * @param {HTMLElement} view
 * @param {string} msgid
 */
async function openMessageActions(view, msgid) {
    const message_el = await u.waitUntil(() => view.querySelector(`.chat-msg[data-msgid="${msgid}"]`));
    const toggle = await u.waitUntil(() =>
        message_el.querySelector('converse-message-actions converse-dropdown .dropdown-toggle'),
    );
    toggle.click();
    return message_el;
}

describe('Closing a poll', function () {
    it(
        'sends the frozen tally with the voters as nicks and stops the votes',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            // Our own poll: the MUC parser makes it `sender: 'me'` when the nick matches.
            receive(_converse, pollFrom(_converse, 'romeo', 'own-poll-1', 'own-poll-stanza'));
            receive(_converse, reactionFrom(_converse, 'juliet', 'own-poll-stanza', '1️⃣'));
            receive(_converse, reactionFrom(_converse, 'benvolio', 'own-poll-stanza', '2️⃣'));
            await u.waitUntil(() => view.querySelectorAll('.isacloud-poll__count')[1]?.textContent === '1');

            vi.spyOn(_converse.api, 'confirm').mockResolvedValue(true);
            const message_el = await openMessageActions(view, 'own-poll-1');
            const close_button = await u.waitUntil(() => message_el.querySelector('.chat-msg__action-close-poll'));

            const send = vi.spyOn(_converse.api.connection.get(), 'send');
            close_button.click();

            const stanza = await u.waitUntil(() => sentClosedStanzas(send)[0]);
            const closed = stanza.querySelector('poll-closed');
            expect(closed.getAttribute('message-id')).toBe('own-poll-1');
            expect(
                [...closed.querySelectorAll('tally')].map((el) => [
                    el.getAttribute('emoji'),
                    el.getAttribute('count'),
                    el.getAttribute('voters'),
                ]),
            ).toEqual([
                ['1️⃣', '1', 'juliet'],
                ['2️⃣', '1', 'benvolio'],
            ]);
            expect(stanza.querySelector('body').textContent).toBe(
                '📊 Poll encerrada: Almoço?\n1️⃣ Pizza: 1\n2️⃣ Sushi: 1',
            );
            expect(stanza.querySelector('fallback').getAttribute('for')).toBe('urn:fluux:poll:0');
            expect(stanza.querySelector('store')).not.toBeNull();

            const original = await u.waitUntil(() =>
                model.messages.find((m) => m.get('isacloud_poll_client_id') === 'own-poll-1'),
            );
            await u.waitUntil(() => original.get('isacloud_poll_closed_at'));
            expect(original.get('isacloud_poll_closed').tally).toEqual([
                { emoji: '1️⃣', label: 'Pizza', count: 1, voters: ['juliet'] },
                { emoji: '2️⃣', label: 'Sushi', count: 1, voters: ['benvolio'] },
            ]);
            // The closing message is consumed: only the original card remains.
            await u.waitUntil(
                () => !model.messages.find((m) => m.get('isacloud_poll_closed') && !m.get('isacloud_poll')),
            );
            await u.waitUntil(() => view.querySelectorAll('converse-isacloud-poll').length === 1);
            const card = await u.waitUntil(() => view.querySelector('.isacloud-poll'));
            expect(card.classList.contains('isacloud-poll--closed')).toBe(true);
            expect(card.querySelector('.isacloud-poll__footer').textContent).toContain('Poll closed · 2 votes');
            expect(view.querySelectorAll('button.isacloud-poll__option')).toHaveLength(0);
        }),
    );

    it(
        'reopens the poll when the closing message fails to send',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollFrom(_converse, 'romeo', 'own-poll-2', 'own-poll-2-stanza'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            vi.spyOn(_converse.api, 'confirm').mockResolvedValue(true);
            const alert = vi.spyOn(_converse.api, 'alert').mockImplementation(() => {});
            vi.spyOn(model, 'sendMessage').mockRejectedValue(new Error('x'));

            const message_el = await openMessageActions(view, 'own-poll-2');
            const close_button = await u.waitUntil(() => message_el.querySelector('.chat-msg__action-close-poll'));
            close_button.click();

            await u.waitUntil(() => alert.mock.calls.length);
            const original = model.messages.find((m) => m.get('isacloud_poll_client_id') === 'own-poll-2');
            expect(original.get('isacloud_poll_closed')).toBeUndefined();
            expect(original.get('isacloud_poll_closed_at')).toBeUndefined();
            await u.waitUntil(() => view.querySelectorAll('button.isacloud-poll__option').length === 2);
        }),
    );

    it(
        'applies a valid poll-closed received from the creator',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollFrom(_converse, 'juliet', 'poll-a', 'poll-a-stanza'));
            receive(_converse, closeFrom(_converse, 'juliet', 'poll-a'));

            const original = await u.waitUntil(() =>
                model.messages.find((m) => m.get('isacloud_poll_client_id') === 'poll-a'),
            );
            await u.waitUntil(() => original.get('isacloud_poll_closed_at'));
            expect(original.get('isacloud_poll_closed').tally.map((entry) => entry.count)).toEqual([1, 1]);
            // The closing is consumed instead of becoming a second card.
            expect(model.messages.filter((m) => m.get('isacloud_poll_closed') && !m.get('isacloud_poll'))).toHaveLength(
                0,
            );
            expect(await u.waitUntil(() => view.querySelector('.isacloud-poll--closed'))).not.toBeNull();
            expect(view.querySelector('.isacloud-poll__footer').textContent).toContain('Poll closed');
        }),
    );

    it(
        'consumes a repeated poll-closed from the creator',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollFrom(_converse, 'juliet', 'poll-d', 'poll-d-stanza'));
            receive(_converse, closeFrom(_converse, 'juliet', 'poll-d'));

            const original = await u.waitUntil(() =>
                model.messages.find((m) => m.get('isacloud_poll_client_id') === 'poll-d'),
            );
            await u.waitUntil(() => original.get('isacloud_poll_closed_at'));
            const closed_at = original.get('isacloud_poll_closed_at');
            const closed = original.get('isacloud_poll_closed');

            // The second closing is valid too: it is ignored, not accumulated.
            const discarded = new Promise((resolve) => model.messages.once('remove', resolve));
            receive(_converse, closeFrom(_converse, 'juliet', 'poll-d'));
            await discarded;

            expect(original.get('isacloud_poll_closed_at')).toBe(closed_at);
            expect(original.get('isacloud_poll_closed')).toBe(closed);
            expect(model.messages.filter((m) => m.get('isacloud_poll_closed') && !m.get('isacloud_poll'))).toHaveLength(
                0,
            );
            await u.waitUntil(() => view.querySelectorAll('converse-isacloud-poll').length === 1);
        }),
    );

    it(
        'does not close the poll when the sender is not the creator',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollFrom(_converse, 'juliet', 'poll-b', 'poll-b-stanza'));
            receive(_converse, closeFrom(_converse, 'benvolio', 'poll-b'));

            const original = await u.waitUntil(() =>
                model.messages.find((m) => m.get('isacloud_poll_client_id') === 'poll-b'),
            );
            await u.waitUntil(() => model.messages.find((m) => m.get('isacloud_poll_closed')));
            expect(original.get('isacloud_poll_closed_at')).toBeUndefined();
            // An invalid closing is not consumed: it stays as the result card.
            expect(model.messages.filter((m) => m.get('isacloud_poll_closed') && !m.get('isacloud_poll'))).toHaveLength(
                1,
            );
            const cards = await u.waitUntil(() => {
                const els = view.querySelectorAll('converse-isacloud-poll');
                return els.length === 2 ? els : null;
            });
            expect([...cards].some((el) => el.textContent.includes('Final result'))).toBe(true);
            expect(view.querySelectorAll('button.isacloud-poll__option')).toHaveLength(2);
        }),
    );

    it(
        'applies a closing message that arrived before the poll',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, closeFrom(_converse, 'juliet', 'poll-c'));
            receive(_converse, pollFrom(_converse, 'juliet', 'poll-c', 'poll-c-stanza'));

            const original = await u.waitUntil(() =>
                model.messages.find((m) => m.get('isacloud_poll_client_id') === 'poll-c'),
            );
            await u.waitUntil(() => original.get('isacloud_poll_closed_at'));
            expect(original.get('isacloud_poll_closed').tally.map((entry) => entry.count)).toEqual([1, 1]);
            // The pending closing message is removed once the original adopts it.
            expect(model.messages.filter((m) => m.get('isacloud_poll_closed') && !m.get('isacloud_poll'))).toHaveLength(
                0,
            );
            await u.waitUntil(() => view.querySelectorAll('converse-isacloud-poll').length === 1);
        }),
    );
});

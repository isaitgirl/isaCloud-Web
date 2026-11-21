import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Stanza, stx, u } = converse.env;
const SETTINGS = { whitelisted_plugins: ['converse-isacloud-polls'] };
const MUC_JID = 'lounge@montague.lit';
const CONTACT_JID = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
const POLL_STANZA_ID = 'poll-stanza-1';

/**
 * @param {any} _converse
 * @param {Element|any} stanza
 */
function receive(_converse, stanza) {
    _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));
}

/**
 * The reaction stanzas the connection sent, oldest first.
 * @param {any} send - The spy on the connection's `send`.
 * @returns {Element[]}
 */
function sentReactionStanzas(send) {
    return send.mock.calls
        .map(([stanza]) => (stanza instanceof Element ? stanza : stanza.tree()))
        .filter((el) => el.querySelector?.('reactions'));
}

/**
 * Clicks an option, waiting for the card to be rendered (and re-rendered after
 * a previous vote) with that many buttons.
 * @param {HTMLElement} view
 * @param {number} index
 * @returns {Promise<void>}
 */
async function clickOption(view, index) {
    const buttons = await u.waitUntil(() => {
        const els = view.querySelectorAll('button.isacloud-poll__option');
        return els.length > index ? els : null;
    });
    buttons[index].click();
}

/**
 * @param {any} _converse
 * @param {string} nick
 * @param {Object} [options]
 * @param {boolean} [options.multiple]
 * @param {string} [options.deadline]
 * @returns {import('strophe.js').Builder}
 */
function pollMessage(_converse, nick, { multiple = false, deadline = '' } = {}) {
    const attributes = [multiple ? 'allow-multiple="true"' : '', deadline ? `deadline="${deadline}"` : '']
        .filter(Boolean)
        .join(' ');
    return stx`<message xmlns="jabber:client" type="groupchat" id="poll-msg-1" from="${MUC_JID}/${nick}" to="${_converse.jid}">
        <body>📊 Poll: Almoço?
1️⃣ Pizza
2️⃣ Sushi</body>
        <poll xmlns="urn:fluux:poll:0" ${Stanza.unsafeXML(attributes)}>
            <title>Almoço?</title>
            <option emoji="1️⃣">Pizza</option>
            <option emoji="2️⃣">Sushi</option>
        </poll>
        <stanza-id xmlns="urn:xmpp:sid:0" id="${POLL_STANZA_ID}" by="${MUC_JID}"/>
    </message>`;
}

/**
 * @param {any} _converse
 * @param {string} nick
 * @param {string} emoji
 * @param {string} [occupant_id]
 * @returns {import('strophe.js').Builder}
 */
function reaction(_converse, nick, emoji, occupant_id) {
    return stx`<message xmlns="jabber:client" type="groupchat" from="${MUC_JID}/${nick}" to="${_converse.jid}">
        <reactions xmlns="urn:xmpp:reactions:0" id="${POLL_STANZA_ID}"><reaction>${emoji}</reaction></reactions>
        ${occupant_id ? stx`<occupant-id xmlns="urn:xmpp:occupant-id:0" id="${occupant_id}"/>` : ''}
    </message>`;
}

/**
 * @param {any} _converse
 * @returns {Promise<{view: HTMLElement, model: any}>}
 */
async function openRoom(_converse) {
    await mock.openAndEnterMUC(_converse, MUC_JID, 'romeo');
    const view = _converse.chatboxviews.get(MUC_JID);
    return { view, model: view.model };
}

describe('The poll card in a groupchat', function () {
    it(
        'shows the poll and hides the textual fallback',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));

            const card = await u.waitUntil(() => view.querySelector('.isacloud-poll'));
            expect(card.querySelector('.isacloud-poll__title').textContent).toBe('Almoço?');
            expect(card.querySelectorAll('.isacloud-poll__option')).toHaveLength(2);
            expect(card.textContent).toContain('Pizza');
            expect(card.textContent).toContain('Sushi');
            expect(card.querySelector('.isacloud-poll__footer').textContent).toContain('No votes yet');
            // The textual fallback is not shown next to the card.
            expect(view.querySelector('.chat-msg__text')).toBeNull();

            const message = view.model.messages.find((m) => m.get('isacloud_poll'));
            expect(message.get('isacloud_poll').title).toBe('Almoço?');
            expect(message.get('hidden_reaction_emojis')).toEqual(['1️⃣', '2️⃣']);
        }),
    );

    it(
        'counts the reactions and keeps the option emojis out of the reaction row',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            receive(_converse, reaction(_converse, 'juliet', '1️⃣', 'juliet-oc'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll__count')?.textContent === '1');

            // The option emoji is shown by the card, not as a reaction chip.
            expect(view.querySelector('.chat-msg__reactions')).toBeNull();

            receive(_converse, reaction(_converse, 'benvolio', '👍', 'benvolio-oc'));
            const chip = await u.waitUntil(() => view.querySelector('.chat-msg__reaction'));
            expect(chip.textContent).toContain('👍');
            expect(view.querySelector('.chat-msg__reactions').textContent).not.toContain('1️⃣');
        }),
    );

    it(
        'renders a frozen result for a poll-closed message',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            const closed = stx`<message xmlns="jabber:client" type="groupchat" id="close-msg-1" from="${MUC_JID}/juliet" to="romeo@montague.lit">
                <body>📊 Poll encerrada: Almoço?</body>
                <poll-closed xmlns="urn:fluux:poll:0" message-id="other-poll">
                    <title>Almoço?</title>
                    <tally emoji="1️⃣" label="Pizza" count="2" voters="ana,bia"/>
                    <tally emoji="2️⃣" label="Sushi" count="1" voters="ana"/>
                </poll-closed>
            </message>`;
            receive(_converse, closed);

            const card = await u.waitUntil(() => view.querySelector('.isacloud-poll--closed'));
            expect(card.querySelector('.isacloud-poll__title').textContent).toBe('Almoço?');
            expect(card.querySelector('.isacloud-poll__footer').textContent).toContain('Final result · 2 votes');
            expect(card.querySelectorAll('.isacloud-poll__option')).toHaveLength(2);
        }),
    );

    it(
        'sends the clicked option as a reaction and toggles it off',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            const send = vi.spyOn(_converse.api.connection.get(), 'send');
            const sentReactions = () => sentReactionStanzas(send);

            await clickOption(view, 0);
            await u.waitUntil(() => sentReactions().length === 1);
            let reactions = sentReactions()[0].querySelector('reactions');
            expect(reactions.getAttribute('id')).toBe(POLL_STANZA_ID);
            expect([...reactions.querySelectorAll('reaction')].map((el) => el.textContent)).toEqual(['1️⃣']);

            await clickOption(view, 0);
            await u.waitUntil(() => sentReactions().length === 2);
            reactions = sentReactions()[1].querySelector('reactions');
            expect([...reactions.querySelectorAll('reaction')]).toHaveLength(0);
            await u.waitUntil(() => view.querySelector('.isacloud-poll__footer').textContent.includes('No votes yet'));
        }),
    );

    it(
        'replaces the single-choice vote when another option is clicked',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            const send = vi.spyOn(_converse.api.connection.get(), 'send');

            await clickOption(view, 0);
            await u.waitUntil(() => send.mock.calls.length);
            await clickOption(view, 1);
            await u.waitUntil(() => send.mock.calls.length === 2);

            const sent = sentReactionStanzas(send);
            const reactions = sent[1].querySelector('reactions');
            expect([...reactions.querySelectorAll('reaction')].map((el) => el.textContent)).toEqual(['2️⃣']);

            const pressed = [...view.querySelectorAll('button.isacloud-poll__option')].map((button) =>
                button.getAttribute('aria-pressed'),
            );
            expect(pressed).toEqual(['false', 'true']);
        }),
    );

    it(
        'keeps a reaction that is not an option when voting',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            // Something the user reacted with using the normal reaction picker.
            const my_key = u.reactions.getOwnReactionJID(model);
            const message = model.messages.find((m) => m.get('isacloud_poll'));
            message.save({ reactions: { [my_key]: ['👍'] } });

            const send = vi.spyOn(_converse.api.connection.get(), 'send');
            await clickOption(view, 0);
            await u.waitUntil(() => send.mock.calls.length);

            const stanza = sentReactionStanzas(send)[0];
            const reactions = stanza.querySelector('reactions');
            expect([...reactions.querySelectorAll('reaction')].map((el) => el.textContent)).toEqual(['👍', '1️⃣']);
        }),
    );

    it(
        'sends the vote in the clear even when the room is encrypted',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view, model } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet'));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));
            model.save('omemo_active', true);

            const send = vi.spyOn(_converse.api.connection.get(), 'send');
            await clickOption(view, 0);
            await u.waitUntil(() => send.mock.calls.length);

            const stanza = sentReactionStanzas(send)[0];
            expect(stanza.querySelector('reactions reaction').textContent).toBe('1️⃣');
            expect(stanza.querySelector('encrypted')).toBeNull();
        }),
    );

    it(
        'does not offer a vote after the deadline',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { view } = await openRoom(_converse);
            receive(_converse, pollMessage(_converse, 'juliet', { deadline: '2020-01-01T00:00:00Z' }));
            await u.waitUntil(() => view.querySelector('.isacloud-poll'));

            expect(view.querySelector('button.isacloud-poll__option')).toBeNull();
            expect(view.querySelectorAll('.isacloud-poll__option').length).toBe(2);
            expect(view.querySelector('.isacloud-poll__footer').textContent).toContain('Poll closed');
        }),
    );

    it(
        'does not hide the body or show a card in a one-to-one chat',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, CONTACT_JID);
            const view = _converse.chatboxviews.get(CONTACT_JID);
            const body = '📊 Poll: Almoço? 1️⃣ Pizza 2️⃣ Sushi';
            _converse.handleMessageStanza(stx`<message xmlns="jabber:client" from="${CONTACT_JID}" to="${_converse.jid}" type="chat">
                <body>${body}</body>
                <poll xmlns="urn:fluux:poll:0">
                    <title>Almoço?</title>
                    <option emoji="1️⃣">Pizza</option>
                    <option emoji="2️⃣">Sushi</option>
                </poll>
            </message>`);

            const text = await u.waitUntil(() => view.querySelector('.chat-msg__text'));
            expect(text.textContent).toContain(body);
            expect(view.querySelector('.isacloud-poll')).toBeNull();
        }),
    );
});

import converse from '../../../../dist/converse.js';
import { getInnerMUCMessage, parsePollClosedElement, parsePollElement, parsePollMessage } from '../parsers.js';

const { stx } = converse.env;

/**
 * @param {any} children
 * @returns {Element}
 */
function groupchat(children) {
    return stx`<message xmlns="jabber:client" type="groupchat">${children}</message>`.tree();
}

describe('Parsing a Fluux poll', function () {
    const fullPoll =
        () => stx`<poll xmlns="urn:fluux:poll:0" allow-multiple="true" hide-results="true" deadline="2026-11-30T18:00:00Z">
        <title>Almoço?</title>
        <description>Escolha um</description>
        <option emoji="1️⃣">Pizza</option>
        <option emoji="2️⃣">Sushi</option>
    </poll>`;

    it('reads the title, description, flags, deadline and options', function () {
        const message = groupchat(stx`<body>fallback</body>${fullPoll()}`);
        expect(parsePollElement(message)).toEqual({
            title: 'Almoço?',
            description: 'Escolha um',
            allow_multiple: true,
            hide_results: true,
            deadline: '2026-11-30T18:00:00.000Z',
            options: [
                { emoji: '1️⃣', label: 'Pizza' },
                { emoji: '2️⃣', label: 'Sushi' },
            ],
        });
    });

    it('treats absent flags as false and an unreadable deadline as none', function () {
        const message = groupchat(stx`<poll xmlns="urn:fluux:poll:0" deadline="nope">
            <title>T</title>
            <option emoji="1️⃣">A</option>
            <option emoji="2️⃣">B</option>
        </poll>`);
        const poll = parsePollElement(message);
        expect(poll.allow_multiple).toBe(false);
        expect(poll.hide_results).toBe(false);
        expect(poll.deadline).toBeUndefined();
        expect(poll.description).toBeUndefined();
    });

    it('drops options without an emoji or a label, and rejects fewer than two', function () {
        const message = groupchat(stx`<poll xmlns="urn:fluux:poll:0">
            <title>T</title>
            <option emoji="1️⃣">A</option>
            <option emoji="">B</option>
            <option>C</option>
        </poll>`);
        expect(parsePollElement(message)).toBeNull();
    });

    it('rejects an empty title', function () {
        const message = groupchat(stx`<poll xmlns="urn:fluux:poll:0">
            <title> </title>
            <option emoji="1️⃣">A</option>
            <option emoji="2️⃣">B</option>
        </poll>`);
        expect(parsePollElement(message)).toBeNull();
    });

    it('reads a poll-closed tally', function () {
        const message = groupchat(stx`<poll-closed xmlns="urn:fluux:poll:0" message-id="poll-1">
            <title>Almoço?</title>
            <tally emoji="1️⃣" label="Pizza" count="2" voters="ana,bia"/>
            <tally emoji="2️⃣" label="Sushi" count="0"/>
        </poll-closed>`);
        expect(parsePollClosedElement(message)).toEqual({
            message_id: 'poll-1',
            title: 'Almoço?',
            description: undefined,
            tally: [
                { emoji: '1️⃣', label: 'Pizza', count: 2, voters: ['ana', 'bia'] },
                { emoji: '2️⃣', label: 'Sushi', count: 0, voters: [] },
            ],
        });
    });

    it('rejects a poll-closed without message-id or tally', function () {
        const no_id = groupchat(stx`<poll-closed xmlns="urn:fluux:poll:0">
            <title>T</title><tally emoji="1️⃣" count="1"/>
        </poll-closed>`);
        expect(parsePollClosedElement(no_id)).toBeNull();

        const no_tally = groupchat(stx`<poll-closed xmlns="urn:fluux:poll:0" message-id="p">
            <title>T</title>
        </poll-closed>`);
        expect(parsePollClosedElement(no_tally)).toBeNull();
    });

    it('turns a groupchat poll into message attributes', function () {
        const message = groupchat(stx`<body>fallback</body>${fullPoll()}`);
        const attrs = parsePollMessage(message, { type: 'groupchat', body: 'fallback' });
        expect(attrs.body).toBe('fallback');
        expect(attrs.isacloud_poll.title).toBe('Almoço?');
        expect(attrs.hidden_reaction_emojis).toEqual(['1️⃣', '2️⃣']);
    });

    it('finds the poll inside a MAM result', function () {
        const inner = stx`<message xmlns="jabber:client" type="groupchat" from="room@montague.lit/juliet" id="m1">
            <body>fallback</body>
            ${fullPoll()}
        </message>`;
        const stanza = stx`<message xmlns="jabber:client" from="room@montague.lit" to="romeo@montague.lit">
            <result xmlns="urn:xmpp:mam:2" queryid="q1" id="mam-id">
                <forwarded xmlns="urn:xmpp:forward:0">${inner}</forwarded>
            </result>
        </message>`.tree();
        expect(getInnerMUCMessage(stanza).localName).toBe('message');
        expect(parsePollMessage(stanza, { type: 'groupchat' }).isacloud_poll.title).toBe('Almoço?');
    });

    it('leaves a one-to-one message alone', function () {
        const message =
            stx`<message xmlns="jabber:client" type="chat"><body>fallback</body>${fullPoll()}</message>`.tree();
        const attrs = parsePollMessage(message, { type: 'chat', body: 'fallback' });
        expect(attrs.isacloud_poll).toBeUndefined();
        expect(attrs.hidden_reaction_emojis).toBeUndefined();
    });

    it('deduplicates the hidden option emojis', function () {
        const message = groupchat(stx`<poll xmlns="urn:fluux:poll:0">
            <title>T</title>
            <option emoji="1️⃣">A</option>
            <option emoji="1️⃣">B</option>
            <option emoji="2️⃣">C</option>
        </poll>`);
        expect(parsePollMessage(message, { type: 'groupchat' }).hidden_reaction_emojis).toEqual(['1️⃣', '2️⃣']);
    });
});

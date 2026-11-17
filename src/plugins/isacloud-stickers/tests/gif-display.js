import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { stx, u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };
const NS_STICKERS = 'urn:xmpp:stickers:0';

/**
 * Returns the rendered `converse-chat-message` element whose body is `body`.
 * @param {Element} view
 * @param {string} body
 */
const findMessageEl = (view, body) =>
    Array.from(view.querySelectorAll('converse-chat-message')).find((el) => el.model.get('body') === body);

/**
 * Receives a sticker from the first roster contact and returns its message element.
 * @param {any} _converse
 * @param {string} url
 */
async function receiveSticker(_converse, url) {
    const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
    const view = await mock.openChatBoxFor(_converse, contact_jid);
    const stanza = stx`
        <message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
            <body>${url}</body>
            <x xmlns="jabber:x:oob"><url>${url}</url></x>
            <sticker xmlns="${NS_STICKERS}"/>
        </message>`;
    _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, stanza));
    return u.waitUntil(() => findMessageEl(view, url));
}

describe('An isaCloud sticker GIF', function () {
    it(
        'is shown as a plain image instead of a converse-gif player',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const url = 'https://upload.example.org/received.gif';
            const el = await receiveSticker(_converse, url);

            const img = await u.waitUntil(() => el.querySelector('.chat-msg--sticker img.chat-image'));
            expect(img.getAttribute('src')).toBe(url);
            expect(el.querySelector('converse-gif')).toBeNull();
        }),
    );

    it(
        'is shown as an image even when its URL has no file extension',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            // The sticker marker, not the extension, decides that this is an image.
            const url = 'https://upload.example.org/received';
            const el = await receiveSticker(_converse, url);

            const img = await u.waitUntil(() => el.querySelector('.chat-msg--sticker img.chat-image'));
            expect(img.getAttribute('src')).toBe(url);
            expect(el.querySelector('converse-gif')).toBeNull();
        }),
    );
});

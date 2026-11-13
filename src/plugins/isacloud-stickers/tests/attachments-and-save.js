import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, sizzle, stx, u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'], render_media: true };
const NS_STICKERS = 'urn:xmpp:stickers:0';
const UPLOAD_HOST = 'upload.montague.tld';

/**
 * @param {any} _converse
 * @param {boolean} [upload] - Whether the server offers HTTP Upload.
 */
async function confirmDisco(_converse, upload = true) {
    const domain = _converse.session.get('domain');
    await mock.waitUntilDiscoConfirmed(
        _converse,
        domain,
        [{ category: 'server', type: 'IM' }],
        ['http://jabber.org/protocol/disco#items'],
        [],
        'info',
    );
    if (upload) {
        await mock.waitUntilDiscoConfirmed(_converse, domain, [], [], [UPLOAD_HOST], 'items');
        await mock.waitUntilDiscoConfirmed(_converse, UPLOAD_HOST, [], [Strophe.NS.HTTPUPLOAD], []);
    } else {
        await mock.waitUntilDiscoConfirmed(_converse, domain, [], [], [], 'items');
    }
}

/** @returns {string} JID of the first roster contact. */
const contactJID = () => mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/** @param {number} width @param {number} height */
async function makePNG(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').fillRect(0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

describe('The stickers in the attachment menu and the message menu', function () {
    it(
        'adds a Stickers item after the image item when uploads are supported',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await confirmDisco(_converse, true);
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contactJID());
            const view = _converse.chatboxviews.get(contactJID());
            const menu = await u.waitUntil(() => view.querySelector('converse-attachment-menu'));
            await menu.initialized;
            const names = Array.from(view.querySelectorAll('.attachment-menu__item')).map((el) => el.dataset.name);
            expect(names.indexOf('stickers')).toBe(names.indexOf('image') + 1);
            expect(view.querySelector('.attachment-menu__item[data-name="stickers"]').textContent).toContain(
                'Stickers',
            );
        }),
    );

    it(
        'has no Stickers item when the server has no HTTP Upload',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await confirmDisco(_converse, false);
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contactJID());
            const view = _converse.chatboxviews.get(contactJID());
            const menu = await u.waitUntil(() => view.querySelector('converse-attachment-menu'));
            await menu.initialized;
            expect(view.querySelector('.attachment-menu__item[data-name="stickers"]')).toBeNull();
        }),
    );

    it(
        'puts a stickers shortcut with the sticker icon right after the paperclip',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await confirmDisco(_converse, true);
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contactJID());
            const view = _converse.chatboxviews.get(contactJID());
            const button = await u.waitUntil(() => view.querySelector('.toolbar-buttons .isacloud-stickers-button'));
            expect(button.previousElementSibling.localName).toBe('converse-attachment-menu');
            expect(button.querySelector('converse-icon').getAttribute('class')).toContain('fa-isacloud-sticker');
            expect(document.getElementById('icon-isacloud-sticker')).not.toBeNull();

            const menu = view.querySelector('converse-attachment-menu');
            await menu.initialized;
            const item = await u.waitUntil(() => view.querySelector('.attachment-menu__item[data-name="stickers"]'));
            expect(item.querySelector('converse-icon').getAttribute('class')).toContain('fa-isacloud-sticker');

            button.click();
            const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));
            expect(modal).not.toBeNull();
        }),
    );

    it(
        'has no stickers shortcut when the server has no HTTP Upload',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await confirmDisco(_converse, false);
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, contactJID());
            const view = _converse.chatboxviews.get(contactJID());
            const menu = await u.waitUntil(() => view.querySelector('converse-attachment-menu'));
            await menu.initialized;
            await u.waitUntil(() => view.querySelector('.toolbar-buttons converse-attachment-menu'));
            expect(view.querySelector('.isacloud-stickers-button')).toBeNull();
        }),
    );

    it(
        'offers "Save sticker" on a received sticker',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = contactJID();
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const url = 'https://upload.example.org/received-sticker.png';
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                        <body>${url}</body>
                        <x xmlns="jabber:x:oob"><url>${url}</url></x>
                        <sticker xmlns="${NS_STICKERS}"/>
                    </message>`,
                ),
            );
            await u.waitUntil(() => view.querySelector('.chat-msg--sticker'));
            expect(view.querySelector('.chat-msg__action-save-sticker')).not.toBeNull();
        }),
    );

    it(
        'is not offered on a received image, nor on a sticker we sent',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = contactJID();
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const photo = 'https://upload.example.org/photo.png';
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                        <body>${photo}</body>
                        <x xmlns="jabber:x:oob"><url>${photo}</url></x>
                    </message>`,
                ),
            );
            const own = 'https://upload.example.org/own-sticker.png';
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<message from="${_converse.bare_jid}" id="${u.getUniqueId()}" to="${_converse.jid}" type="chat" xmlns="jabber:client">
                        <sent xmlns="urn:xmpp:carbons:2">
                            <forwarded xmlns="urn:xmpp:forward:0">
                                <message xmlns="jabber:client" from="${_converse.bare_jid}/another-resource" to="${contact_jid}" type="chat">
                                    <body>${own}</body>
                                    <x xmlns="jabber:x:oob"><url>${own}</url></x>
                                    <sticker xmlns="${NS_STICKERS}"/>
                                </message>
                            </forwarded>
                        </sent>
                    </message>`,
                ),
            );
            await u.waitUntil(() => view.querySelector('.chat-msg--sticker'));
            expect(view.querySelector('.chat-msg__action-save-sticker')).toBeNull();
        }),
    );

    it(
        'saves the sticker once, however many times it is saved',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library } = _converse.exports.isacloud_stickers;
            for (const sticker of await library.listStickers()) await library.deleteSticker(sticker.id);

            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = contactJID();
            const view = await mock.openChatBoxFor(_converse, contact_jid);
            const url = 'https://upload.example.org/saved-sticker.png';
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<message xmlns="jabber:client" type="chat" id="${u.getUniqueId()}" to="${_converse.jid}" from="${contact_jid}">
                        <body>${url}</body>
                        <x xmlns="jabber:x:oob"><url>${url}</url></x>
                        <sticker xmlns="${NS_STICKERS}"/>
                    </message>`,
                ),
            );
            const png = await makePNG(300, 300);
            vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(png, { status: 200 }));

            try {
                const button = await u.waitUntil(() => view.querySelector('.chat-msg__action-save-sticker'));
                button.click();
                await vi.waitFor(async () => expect((await library.listStickers()).length).toBe(1));
                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                expect((await library.listStickers()).length).toBe(1);
            } finally {
                vi.restoreAllMocks();
            }
        }),
    );

    it(
        'opens the picker on an empty library with the empty state',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library, openStickerPicker } = _converse.exports.isacloud_stickers;
            for (const sticker of await library.listStickers()) await library.deleteSticker(sticker.id);
            await mock.waitForRoster(_converse, 'current', 1);
            const view = await mock.openChatBoxFor(_converse, contactJID());
            openStickerPicker(view.model);
            const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));
            const empty = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__empty'));
            expect(empty.textContent).toContain('No stickers yet');
            expect(empty.querySelector('button').textContent).toContain('Create sticker');
            modal.close();
        }),
    );

    it(
        'sends a sticker picked from the picker with the marker',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { library, openStickerPicker } = _converse.exports.isacloud_stickers;
            for (const sticker of await library.listStickers()) await library.deleteSticker(sticker.id);
            await library.addSticker(await makePNG(64, 64));
            await confirmDisco(_converse, true);
            await mock.waitForRoster(_converse, 'current', 1);
            const view = await mock.openChatBoxFor(_converse, contactJID());
            openStickerPicker(view.model);
            const modal = await u.waitUntil(() => document.querySelector('converse-isacloud-stickers-modal'));
            const item = await u.waitUntil(() => modal.querySelector('.isacloud-stickers__item'));

            const sent_stanzas = _converse.api.connection.get().sent_stanzas;
            const IQ_stanzas = _converse.api.connection.get().IQ_stanzas;
            const backup = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function () {
                Object.defineProperty(this, 'status', { value: 200 });
                Object.defineProperty(this, 'readyState', { value: XMLHttpRequest.DONE });
                this.onreadystatechange();
            };
            try {
                item.click();
                const iq = await u.waitUntil(() =>
                    IQ_stanzas.find((iq) => iq.getAttribute('to') === UPLOAD_HOST && iq.querySelector('request')),
                );
                const filename = iq.querySelector('request').getAttribute('filename');
                _converse.api.connection.get()._dataRecv(
                    mock.createRequest(
                        _converse,
                        stx`<iq from="${UPLOAD_HOST}" id="${iq.getAttribute('id')}" to="romeo@montague.lit/orchard" type="result" xmlns="jabber:client">
                            <slot xmlns="urn:xmpp:http:upload:0">
                                <put url="https://${UPLOAD_HOST}/put/${filename}"/>
                                <get url="https://${UPLOAD_HOST}/get/${filename}"/>
                            </slot>
                        </iq>`,
                    ),
                );
                const message = await u.waitUntil(() =>
                    sent_stanzas.find(
                        (s) =>
                            s.localName === 'message' &&
                            Array.from(s.children).some(
                                (c) => c.localName === 'x' && c.namespaceURI === 'jabber:x:oob',
                            ),
                    ),
                );
                expect(
                    Array.from(message.children).some(
                        (c) => c.localName === 'sticker' && c.namespaceURI === NS_STICKERS,
                    ),
                ).toBe(true);
            } finally {
                XMLHttpRequest.prototype.send = backup;
            }
        }),
    );
});

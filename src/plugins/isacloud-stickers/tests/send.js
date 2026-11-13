import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, sizzle, stx, u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-stickers'] };
const NS_STICKERS = 'urn:xmpp:stickers:0';
const UPLOAD_HOST = 'upload.montague.tld';

/**
 * Answers the disco queries that make the server offer HTTP Upload.
 * @param {any} _converse
 */
async function confirmUploadService(_converse) {
    const domain = _converse.session.get('domain');
    await mock.waitUntilDiscoConfirmed(
        _converse,
        domain,
        [{ category: 'server', type: 'IM' }],
        ['http://jabber.org/protocol/disco#items'],
        [],
        'info',
    );
    await mock.waitUntilDiscoConfirmed(_converse, domain, [], [], [UPLOAD_HOST], 'items');
    await mock.waitUntilDiscoConfirmed(_converse, UPLOAD_HOST, [], [Strophe.NS.HTTPUPLOAD], []);
}

/**
 * Makes every PUT succeed at once, so that an upload finishes as soon as its slot is known.
 * @returns {() => void} Restores the real XMLHttpRequest.
 */
function completeUploadsAtOnce() {
    const send_backup = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        Object.defineProperty(this, 'status', { value: 200 });
        Object.defineProperty(this, 'readyState', { value: XMLHttpRequest.DONE });
        this.onreadystatechange();
    };
    return () => (XMLHttpRequest.prototype.send = send_backup);
}

/**
 * Answers the slot request of the next upload.
 * @param {any} _converse
 * @returns {Promise<string>} The download URL in the slot.
 */
async function answerSlotRequest(_converse) {
    const IQ_stanzas = _converse.api.connection.get().IQ_stanzas;
    const iq = await u.waitUntil(() =>
        IQ_stanzas.find((iq) => iq.getAttribute('to') === UPLOAD_HOST && iq.querySelector('request')),
    );
    const filename = iq.querySelector('request').getAttribute('filename');
    const get_url = `https://${UPLOAD_HOST}/get/${filename}`;
    _converse.api.connection.get()._dataRecv(
        mock.createRequest(
            _converse,
            stx`<iq from="${UPLOAD_HOST}" id="${iq.getAttribute('id')}" to="romeo@montague.lit/orchard" type="result" xmlns="jabber:client">
                <slot xmlns="urn:xmpp:http:upload:0">
                    <put url="https://${UPLOAD_HOST}/put/${filename}"/>
                    <get url="${get_url}"/>
                </slot>
            </iq>`,
        ),
    );
    return get_url;
}

/**
 * @param {Element} message
 * @returns {boolean} Whether the message carries an out-of-band URL, as uploads do.
 */
const isUploadMessage = (message) =>
    message.localName === 'message' &&
    Array.from(message.children).some((c) => c.localName === 'x' && c.namespaceURI === 'jabber:x:oob');

/**
 * @param {Element} message
 * @returns {boolean} Whether the sticker marker is a DIRECT child of the message.
 */
const hasDirectStickerMarker = (message) =>
    Array.from(message.children).some((c) => c.localName === 'sticker' && c.namespaceURI === NS_STICKERS);

/**
 * Answers the bundle requests that sending an OMEMO message makes, for the
 * contact's device 555 and for our own other device.
 * @param {any} _converse
 * @param {string} contact_jid
 */
async function answerBundles(_converse, contact_jid) {
    const own_device = '482886413b977930064a5888b92134fe';
    const iq_contact = await u.waitUntil(() => mock.bundleIQRequestSent(_converse, contact_jid, '555'));
    _converse.api.connection.get()._dataRecv(
        mock.createRequest(
            _converse,
            stx`<iq from="${contact_jid}" id="${iq_contact.getAttribute('id')}" to="${_converse.bare_jid}" type="result" xmlns="jabber:client">
                <pubsub xmlns="http://jabber.org/protocol/pubsub">
                    <items node="eu.siacs.conversations.axolotl.bundles:555">
                        <item>
                            <bundle xmlns="eu.siacs.conversations.axolotl">
                                <signedPreKeyPublic signedPreKeyId="4223">${btoa('1111')}</signedPreKeyPublic>
                                <signedPreKeySignature>${btoa('2222')}</signedPreKeySignature>
                                <identityKey>${btoa('3333')}</identityKey>
                                <prekeys>
                                    <preKeyPublic preKeyId="1">${btoa('1001')}</preKeyPublic>
                                    <preKeyPublic preKeyId="2">${btoa('1002')}</preKeyPublic>
                                    <preKeyPublic preKeyId="3">${btoa('1003')}</preKeyPublic>
                                </prekeys>
                            </bundle>
                        </item>
                    </items>
                </pubsub>
            </iq>`,
        ),
    );
    const iq_own = await u.waitUntil(() => mock.bundleIQRequestSent(_converse, _converse.bare_jid, own_device));
    _converse.api.connection.get()._dataRecv(
        mock.createRequest(
            _converse,
            stx`<iq from="${_converse.bare_jid}" id="${iq_own.getAttribute('id')}" to="${_converse.bare_jid}" type="result" xmlns="jabber:client">
                <pubsub xmlns="http://jabber.org/protocol/pubsub">
                    <items node="eu.siacs.conversations.axolotl.bundles:${own_device}">
                        <item>
                            <bundle xmlns="eu.siacs.conversations.axolotl">
                                <signedPreKeyPublic signedPreKeyId="4224">${btoa('100000')}</signedPreKeyPublic>
                                <signedPreKeySignature>${btoa('200000')}</signedPreKeySignature>
                                <identityKey>${btoa('300000')}</identityKey>
                                <prekeys>
                                    <preKeyPublic preKeyId="1">${btoa('1991')}</preKeyPublic>
                                    <preKeyPublic preKeyId="2">${btoa('1992')}</preKeyPublic>
                                    <preKeyPublic preKeyId="3">${btoa('1993')}</preKeyPublic>
                                </prekeys>
                            </bundle>
                        </item>
                    </items>
                </pubsub>
            </iq>`,
        ),
    );
}

/** @returns {Blob} */
const stickerBlob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });

describe('Sending a sticker', function () {
    it(
        'in a 1:1 chat is an upload with the sticker marker as a direct child',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { sendSticker } = _converse.exports.isacloud_stickers;
            await confirmUploadService(_converse);
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);
            const restore = completeUploadsAtOnce();
            try {
                const sending = sendSticker(view.model, stickerBlob());
                const url = await answerSlotRequest(_converse);
                await sending;

                const sent_stanzas = _converse.api.connection.get().sent_stanzas;
                const message = await u.waitUntil(() =>
                    sent_stanzas.find((s) => isUploadMessage(s) && s.querySelector('body')?.textContent === url),
                );
                expect(message.getAttribute('type')).toBe('chat');
                expect(hasDirectStickerMarker(message)).toBe(true);
                expect(message.querySelector('sticker').namespaceURI).toBe(NS_STICKERS);

                const local = view.model.messages.filter((m) => m.get('isacloud_sticker'));
                expect(local.length).toBe(1);
                await u.waitUntil(() => view.querySelector('.chat-msg--sticker'));
            } finally {
                restore();
            }
        }),
    );

    it(
        'of a normal file is an upload without the marker',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await confirmUploadService(_converse);
            await mock.waitForRoster(_converse, 'current', 1);
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            await mock.openChatBoxFor(_converse, contact_jid);
            const view = _converse.chatboxviews.get(contact_jid);
            const restore = completeUploadsAtOnce();
            try {
                const file = new File([new Uint8Array(2345)], 'my-juliet.jpg', { type: 'image/jpeg' });
                const sending = view.model.sendFiles([file]);
                const url = await answerSlotRequest(_converse);
                await sending;

                const sent_stanzas = _converse.api.connection.get().sent_stanzas;
                const message = await u.waitUntil(() =>
                    sent_stanzas.find((s) => isUploadMessage(s) && s.querySelector('body')?.textContent === url),
                );
                expect(message.querySelector('sticker')).toBeNull();
                expect(view.model.messages.filter((m) => m.get('isacloud_sticker')).length).toBe(0);
                expect(view.querySelector('.chat-msg--sticker')).toBeNull();
            } finally {
                restore();
            }
        }),
    );

    it(
        'with OMEMO keeps the marker outside the encrypted payload',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { sendSticker } = _converse.exports.isacloud_stickers;
            await confirmUploadService(_converse);
            await mock.waitForRoster(_converse, 'current', 3);
            const contact_jid = mock.cur_names[2].replace(/ /g, '.').toLowerCase() + '@montague.lit';

            await u.waitUntil(() => mock.initializedOMEMO(_converse));
            await mock.openChatBoxFor(_converse, contact_jid);

            const iq_stanza = await u.waitUntil(() => mock.deviceListFetched(_converse, contact_jid));
            _converse.api.connection.get()._dataRecv(
                mock.createRequest(
                    _converse,
                    stx`<iq from="${contact_jid}" id="${iq_stanza.getAttribute('id')}" to="${_converse.api.connection.get().jid}" type="result" xmlns="jabber:client">
                        <pubsub xmlns="http://jabber.org/protocol/pubsub">
                            <items node="eu.siacs.conversations.axolotl.devicelist">
                                <item xmlns="http://jabber.org/protocol/pubsub">
                                    <list xmlns="eu.siacs.conversations.axolotl"><device id="555"/></list>
                                </item>
                            </items>
                        </pubsub>
                    </iq>`,
                ),
            );
            await u.waitUntil(() => _converse.state.omemo_store);
            const devicelist = _converse.state.devicelists.get({ jid: contact_jid });
            await u.waitUntil(() => devicelist.devices.length === 1);

            const view = _converse.chatboxviews.get(contact_jid);
            view.model.set('omemo_active', true);
            const restore = completeUploadsAtOnce();
            try {
                const sending = sendSticker(view.model, stickerBlob());
                const url = await answerSlotRequest(_converse);
                await sending;
                await answerBundles(_converse, contact_jid);

                const sent_stanzas = _converse.api.connection.get().sent_stanzas;
                const message = await u.waitUntil(() =>
                    sent_stanzas.find((s) => s.localName === 'message' && s.querySelector('encrypted')),
                );
                expect(hasDirectStickerMarker(message)).toBe(true);
                // The marker is not inside the encrypted element, and the body holds no plain URL.
                expect(message.querySelector('encrypted sticker')).toBeNull();
                expect(message.querySelector('body')?.textContent).not.toBe(url);
            } finally {
                restore();
            }
        }),
    );

    it(
        'in a groupchat is a groupchat message with the marker',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { sendSticker } = _converse.exports.isacloud_stickers;
            await confirmUploadService(_converse);
            const muc_jid = 'lounge@montague.lit';
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');
            const sent_stanzas = _converse.api.connection.get().sent_stanzas;
            await u.waitUntil(() => sent_stanzas.filter((s) => sizzle(`[xmlns="${Strophe.NS.MAM}"]`, s).length).pop());

            const view = _converse.chatboxviews.get(muc_jid);
            const restore = completeUploadsAtOnce();
            try {
                const sending = sendSticker(view.model, stickerBlob());
                const url = await answerSlotRequest(_converse);
                await sending;

                const message = await u.waitUntil(() =>
                    sent_stanzas.find((s) => isUploadMessage(s) && s.querySelector('body')?.textContent === url),
                );
                expect(message.getAttribute('type')).toBe('groupchat');
                expect(hasDirectStickerMarker(message)).toBe(true);
            } finally {
                restore();
            }
        }),
    );
});

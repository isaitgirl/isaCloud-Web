import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, stx, u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-replies'] };
const NS_ISACLOUD_QUOTE = 'urn:isacloud:quote:0';

/** @returns {string} JID of the first roster contact. */
const contactJID = () => mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/** @param {any} _converse */
const replies = (_converse) => _converse.exports.isacloud_replies;

/**
 * @param {Element} message
 * @param {string} local_name
 * @param {string} namespace
 * @returns {Element|undefined}
 */
const directChild = (message, local_name, namespace) =>
    Array.from(message.children).find((child) => child.localName === local_name && child.namespaceURI === namespace);

/** @param {Element} stanza */
const stanzaElement = (stanza) => /** @type {any} */ (stanza).tree();

/**
 * Opens a 1:1 chat with the first roster contact.
 * @param {any} _converse
 */
async function openChat(_converse) {
    await mock.waitForRoster(_converse, 'current', 1);
    const contact_jid = contactJID();
    const view = await mock.openChatBoxFor(_converse, contact_jid);
    return { contact_jid, chat: view.model, view };
}

/**
 * Creates an incoming message model, so that a reply can resolve it.
 * @param {any} chat
 * @param {Object} attrs
 */
async function createOriginal(chat, attrs) {
    const id = u.getUniqueId();
    return chat.createMessage({
        type: 'chat',
        sender: 'them',
        from: chat.get('jid'),
        body: 'Original message',
        message: 'Original message',
        id,
        msgid: id,
        ...attrs,
    });
}

/**
 * Builds the outgoing attributes of a reply and creates its model, as the chat
 * box would when sending.
 * @param {any} chat
 * @param {string} original_id
 * @param {string} body
 */
async function createReply(chat, original_id, body) {
    const attrs = await chat.getOutgoingMessageAttributes({ body, reply_to_id: original_id });
    const message = await chat.createMessage({ ...attrs, type: 'chat' });
    return { attrs, message };
}

/**
 * A stanza shaped like the cleartext one `createMessageStanza` builds, plus an
 * optional `<encrypted/>`.
 * @param {string} body
 * @param {string} [encryption_namespace]
 */
const stanzaWithBody = (body, encryption_namespace) =>
    stx`<message xmlns="jabber:client" type="chat" to="mercutio@montague.lit">
        <body>${body}</body>
        ${encryption_namespace ? stx`<encrypted xmlns="${encryption_namespace}"><header sid="1"/><payload>ciphertext</payload></encrypted>` : ''}
    </message>`;

describe('isaCloud replies (XEP-0461)', function () {
    describe('the synthesized fallback of an old quote', function () {
        it(
            'counts the quoted block in Unicode code points, as in the contract table',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { synthesizeQuoteFallback } = replies(_converse);
                // The table from the guide (§4). The `end` is exclusive.
                expect(synthesizeQuoteFallback('> Ana: oi\nTudo bem?')).toEqual({ start: 0, end: 10 });
                expect(synthesizeQuoteFallback('> 📷 Foto\nLindo!')).toEqual({ start: 0, end: 9 });
                expect(synthesizeQuoteFallback('> Ana: 🎞️ GIF\nKkk')).toEqual({ start: 0, end: 14 });
                expect(synthesizeQuoteFallback('> João: ação\nOk')).toEqual({ start: 0, end: 13 });
                expect(synthesizeQuoteFallback('> Ana\n> Vamos?\nBoa ideia!')).toEqual({ start: 0, end: 15 });
                // The quote is not at the start: nothing to fall back to.
                expect(synthesizeQuoteFallback('Só um texto\n> Ana: oi')).toBeUndefined();
                // Nothing but the quote: no reply text left to keep.
                expect(synthesizeQuoteFallback('> Ana: oi')).toBeUndefined();
            }),
        );

        it(
            'handles a trailing newline and a body that is only a quote',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { synthesizeQuoteFallback } = replies(_converse);
                expect(synthesizeQuoteFallback('> Ana: oi\nTudo bem?\n')).toEqual({ start: 0, end: 10 });
                expect(synthesizeQuoteFallback('> Ana: oi\n')).toBeUndefined();
                expect(synthesizeQuoteFallback('> Ana: oi\n   \n')).toBeUndefined();
            }),
        );
    });

    describe('reading', function () {
        it(
            'takes reply_to_id from <isacloud-quote> in a 1:1 and hides the quote behind the card',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { contact_jid, view } = await openChat(_converse);
                const original_id = u.getUniqueId();
                await _converse.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${contact_jid}" to="${_converse.api.connection.get().jid}"
                            type="chat" id="${original_id}">
                        <body>Original message</body>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 1);

                const reply_body = '> Mercutio: Original message\nThis is a reply';
                await _converse.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${contact_jid}" to="${_converse.api.connection.get().jid}"
                            type="chat" id="${u.getUniqueId()}">
                        <body>${reply_body}</body>
                        <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="${original_id}"/>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 2);

                const reply = view.model.messages.last();
                expect(reply.get('reply_to_id')).toBe(original_id);
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toEqual({
                    start: 0,
                    end: [...reply_body.slice(0, reply_body.indexOf('This is a reply'))].length,
                });
                // The card shows the context, so the `>` quote must not show as well.
                expect(reply.getMessageText()).toBe('This is a reply');
                const text_els = view.querySelectorAll('.chat-msg__text');
                expect(text_els[text_els.length - 1].textContent.trim()).toBe('This is a reply');
            }),
        );

        it(
            'prefers <reply> over <isacloud-quote>',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { contact_jid, view } = await openChat(_converse);
                const reply_target = u.getUniqueId();
                const quote_target = u.getUniqueId();
                await _converse.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${contact_jid}" to="${_converse.api.connection.get().jid}"
                            type="chat" id="${u.getUniqueId()}">
                        <body>This is a reply</body>
                        <reply xmlns="${Strophe.NS.REPLY}" id="${reply_target}" to="${contact_jid}"/>
                        <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="${quote_target}"/>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 1);
                expect(view.model.messages.last().get('reply_to_id')).toBe(reply_target);
            }),
        );

        it(
            'reads <isacloud-quote> in a 1:1 MAM result',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { contact_jid, view } = await openChat(_converse);
                await _converse.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${_converse.bare_jid}" to="${_converse.bare_jid}">
                        <result xmlns="urn:xmpp:mam:2" queryid="q1" id="${u.getUniqueId()}">
                            <forwarded xmlns="urn:xmpp:forward:0">
                                <delay xmlns="urn:xmpp:delay" stamp="2026-11-01T10:00:00Z"/>
                                <message xmlns="jabber:client" to="${_converse.bare_jid}" from="${contact_jid}"
                                        type="chat" id="${u.getUniqueId()}">
                                    <body>&gt; Mercutio: earlier\nAn archived reply</body>
                                    <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="archived-original"/>
                                </message>
                            </forwarded>
                        </result>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 1);
                const reply = view.model.messages.last();
                expect(reply.get('reply_to_id')).toBe('archived-original');
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toEqual({ start: 0, end: 20 });
                expect(reply.get('is_archived')).toBe(true);
            }),
        );

        it(
            'reads <isacloud-quote> in a groupchat stanza',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const muc_jid = 'lounge@montague.lit';
                await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');
                const view = _converse.chatboxviews.get(muc_jid);

                const original_id = u.getUniqueId();
                await view.model.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${muc_jid}/juliet" to="${_converse.jid}"
                            type="groupchat" id="${original_id}">
                        <body>Original message</body>
                        <stanza-id xmlns="urn:xmpp:sid:0" id="${original_id}" by="${muc_jid}"/>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 1);

                await view.model.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${muc_jid}/mercutio" to="${_converse.jid}"
                            type="groupchat" id="${u.getUniqueId()}">
                        <body>&gt; Juliet: Original message\nA group reply</body>
                        <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="${original_id}"/>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 2);

                const reply = view.model.messages.last();
                expect(reply.get('reply_to_id')).toBe(original_id);
                expect(reply.getMessageText()).toBe('A group reply');
            }),
        );

        it(
            'unwraps a MAM result before reading the marker in a groupchat',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addIsacloudQuoteToMUC } = replies(_converse);
                const envelope = stx`
                    <message xmlns="jabber:client">
                        <result xmlns="urn:xmpp:mam:2" queryid="q1" id="${u.getUniqueId()}">
                            <forwarded xmlns="urn:xmpp:forward:0">
                                <message xmlns="jabber:client" type="groupchat">
                                    <body>&gt; Ana: oi\nTudo bem?</body>
                                    <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="muc-archived-id"/>
                                </message>
                            </forwarded>
                        </result>
                    </message>`;
                const attrs = addIsacloudQuoteToMUC(envelope.tree(), { body: '> Ana: oi\nTudo bem?' });
                expect(attrs.reply_to_id).toBe('muc-archived-id');
                expect(attrs.fallback[Strophe.NS.REPLY]).toEqual({ start: 0, end: 10 });
            }),
        );

        it(
            'reads the marker of a legacy-OMEMO message from the decrypted text',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addIsacloudQuote } = replies(_converse);
                // Legacy OMEMO: the cleartext stanza has no <body> (it is
                // encrypted), while the marker travels outside the encryption.
                const stanza = stx`
                    <message xmlns="jabber:client" from="mercutio@montague.lit" type="chat" id="${u.getUniqueId()}">
                        <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="encrypted-original"/>
                    </message>`;
                const attrs = addIsacloudQuote(stanza.tree(), { plaintext: '> Ana: oi\nTudo bem?' });
                expect(attrs.reply_to_id).toBe('encrypted-original');
                expect(attrs.fallback[Strophe.NS.REPLY]).toEqual({ start: 0, end: 10 });
            }),
        );

        it(
            'keeps the quoted text when the original is not loaded (old Android message)',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { contact_jid, view } = await openChat(_converse);
                await _converse.handleMessageStanza(stx`
                    <message xmlns="jabber:client" from="${contact_jid}" to="${_converse.api.connection.get().jid}"
                            type="chat" id="${u.getUniqueId()}">
                        <body>&gt; Ana: oi\nTudo bem?</body>
                        <isacloud-quote xmlns="${NS_ISACLOUD_QUOTE}" id="not-loaded-original"/>
                    </message>`);
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 1);

                const reply = view.model.messages.last();
                expect(reply.get('reply_to_id')).toBe('not-loaded-original');
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toEqual({ start: 0, end: 10 });
                // XEP-0428 §2.2: the fallback is the only copy of the context here.
                expect(reply.getMessageText()).toBe('> Ana: oi\nTudo bem?');
            }),
        );
    });

    describe('sending', function () {
        it(
            'adds <reply> and <fallback> as siblings of the legacy <encrypted>',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply } = replies(_converse);
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, { body: 'Ana: 📷 Foto', message: 'Ana: 📷 Foto' });
                const reply_text = 'Que lindo!';
                const { attrs, message } = await createReply(chat, original.get('msgid'), reply_text);

                // What the OMEMO handler does: the quote is computed on the plain body,
                // then the body is replaced by the undecryptable fallback text.
                const plaintext = attrs.body;
                message.save({ is_encrypted: true, plaintext, body: 'This is an OMEMO encrypted message' });

                const stanza = stanzaWithBody(message.get('body'), Strophe.NS.OMEMO);
                addCleartextReply(null, { message, stanza });

                const tree = stanzaElement(stanza);
                const reply_el = directChild(tree, 'reply', Strophe.NS.REPLY);
                expect(reply_el).toBeDefined();
                expect(reply_el.parentElement).toBe(tree);
                expect(reply_el.getAttribute('id')).toBe(original.get('msgid'));

                const fallback_el = directChild(tree, 'fallback', Strophe.NS.FALLBACK);
                expect(fallback_el.parentElement).toBe(tree);
                expect(fallback_el.getAttribute('for')).toBe(Strophe.NS.REPLY);
                const end = Number(fallback_el.querySelector('body').getAttribute('end'));

                const quote_prefix = plaintext.slice(0, plaintext.length - reply_text.length);
                expect(end).toBe([...quote_prefix].length);
                // The emoji in the quote makes code points smaller than UTF-16 units.
                expect(end).toBeLessThan(quote_prefix.length);

                // The encrypted payload is untouched.
                expect(directChild(tree, 'encrypted', Strophe.NS.OMEMO)).toBeDefined();
            }),
        );

        it(
            'adds nothing in the clear for an omemo:2-only message',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply } = replies(_converse);
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const { message } = await createReply(chat, original.get('msgid'), 'A reply');
                message.save({ is_encrypted: true, plaintext: message.get('body'), body: 'undecryptable' });

                const stanza = stanzaWithBody(message.get('body'), 'urn:xmpp:omemo:2');
                addCleartextReply(null, { message, stanza });

                const tree = stanzaElement(stanza);
                expect(directChild(tree, 'reply', Strophe.NS.REPLY)).toBeUndefined();
                expect(directChild(tree, 'fallback', Strophe.NS.FALLBACK)).toBeUndefined();
            }),
        );

        it(
            'adds nothing in the clear for a cleartext message, which the core already handled',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply } = replies(_converse);
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const { message } = await createReply(chat, original.get('msgid'), 'A reply');

                const stanza = stanzaWithBody(message.get('body'));
                addCleartextReply(null, { message, stanza });

                const tree = stanzaElement(stanza);
                expect(tree.querySelectorAll('reply').length).toBe(0);
                expect(tree.querySelectorAll('fallback').length).toBe(0);
            }),
        );

        it(
            'does not duplicate a <reply> that is already in the clear',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply } = replies(_converse);
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const { message } = await createReply(chat, original.get('msgid'), 'A reply');
                message.save({ is_encrypted: true, plaintext: message.get('body'), body: 'undecryptable' });

                const stanza = stx`<message xmlns="jabber:client" type="chat">
                    <body>undecryptable</body>
                    <encrypted xmlns="${Strophe.NS.OMEMO}"><payload>x</payload></encrypted>
                    <reply xmlns="${Strophe.NS.REPLY}" id="already-there"/>
                </message>`;
                addCleartextReply(null, { message, stanza });

                const tree = stanzaElement(stanza);
                expect(tree.querySelectorAll('reply').length).toBe(1);
                expect(tree.querySelector('reply').getAttribute('id')).toBe('already-there');
            }),
        );

        it(
            'sends <reply> and the rebuilt <fallback> when correcting a reply',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply } = replies(_converse);
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const reply = await chat.sendMessage({ body: 'A reply' }, { replying_to: original });

                // A correction rebuilds the quote for the new body, so the fallback
                // keeps describing what is in the stanza (see `sendMessage`).
                // What the composer does: the edit flag is on the message, and the form calls
                // sendMessage without the option.
                reply.save({ correcting: true });
                await chat.sendMessage({ body: 'A corrected reply' });
                await u.waitUntil(() => reply.get('edited'));
                const fallback = reply.get('fallback')[Strophe.NS.REPLY];
                expect(fallback).toBeDefined();
                expect(reply.get('body').endsWith('A corrected reply')).toBe(true);

                // What the OMEMO send does to the model: the body is encrypted.
                reply.save({ is_encrypted: true, plaintext: reply.get('body'), body: 'undecryptable' });

                const stanza = stx`<message xmlns="jabber:client" type="chat">
                    <body>undecryptable</body>
                    <encrypted xmlns="${Strophe.NS.OMEMO}"><payload>x</payload></encrypted>
                </message>`;
                addCleartextReply(null, { message: reply, stanza });

                const tree = stanzaElement(stanza);
                expect(directChild(tree, 'reply', Strophe.NS.REPLY).getAttribute('id')).toBe(original.get('msgid'));
                const fb_body = directChild(tree, 'fallback', Strophe.NS.FALLBACK)?.querySelector('body');
                expect(fb_body).toBeDefined();
                expect(Number(fb_body.getAttribute('end'))).toBe(fallback.end);
            }),
        );

        it(
            'keeps the quote and a matching <fallback> in a corrected cleartext reply',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const reply = await chat.sendMessage({ body: 'A reply' }, { replying_to: original });

                // What the composer does: the edit flag is on the message, and the form calls
                // sendMessage without the option.
                reply.save({ correcting: true });
                await chat.sendMessage({ body: 'A corrected reply' });
                await u.waitUntil(() => reply.get('edited'));

                const stanza = await chat.createMessageStanza(reply);
                const tree = stanzaElement(stanza);
                expect(tree.querySelectorAll('reply').length).toBe(1);
                expect(tree.querySelector('replace')).not.toBeNull();

                // The body still starts with the quote (the apps draw it from
                // there), and the fallback range covers exactly that quote.
                const body = tree.querySelector('body').textContent;
                const fb_body = tree.querySelector('fallback body');
                expect(fb_body).not.toBeNull();
                expect(body.startsWith('> ')).toBe(true);
                expect(body.endsWith('A corrected reply')).toBe(true);
                expect(Number(fb_body.getAttribute('end'))).toBe([...body].length - [...'A corrected reply'].length);
            }),
        );

        it(
            'shows the corrected text of a reply instead of a blank message',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const reply = await chat.sendMessage({ body: 'A reply' }, { replying_to: original });
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toBeDefined();

                // Corrections rebuild the quote, so the display strips it again and
                // the corrected text is what is shown (not an empty message).
                reply.save({ correcting: true });
                await chat.sendMessage({ body: 'The corrected reply' });
                await u.waitUntil(() => reply.get('edited'));
                expect(reply.getMessageText()).toBe('The corrected reply');
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toBeDefined();
            }),
        );

        it(
            'does not strip a stale fallback left by an older correction',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { chat } = await openChat(_converse);
                const original = await createOriginal(chat, {});
                const reply = await chat.sendMessage({ body: 'A reply' }, { replying_to: original });

                // Messages stored by the build that dropped the fallback on
                // corrections: edited, body without the quote, old range around.
                reply.save({ edited: new Date().toISOString(), body: 'Stored corrected text' });
                expect(reply.getMessageText()).toBe('Stored corrected text');
            }),
        );

        it(
            'keeps the quote in a correction when the original is not loaded',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { chat } = await openChat(_converse);
                const body = '> Ana:\n> oi\nA reply';
                const reply = await chat.createMessage({
                    type: 'chat',
                    sender: 'me',
                    from: _converse.jid,
                    body,
                    message: body,
                    id: u.getUniqueId(),
                    msgid: u.getUniqueId(),
                    origin_id: u.getUniqueId(),
                    reply_to_id: 'original-not-loaded',
                    fallback: { [Strophe.NS.REPLY]: { start: 0, end: 12 } },
                    editable: true,
                    time: new Date().toISOString(),
                });

                reply.save({ correcting: true });
                await chat.sendMessage({ body: 'Corrected' });
                await u.waitUntil(() => reply.get('edited'));
                // The quote the body already carried is kept, with a matching range.
                expect(reply.get('body')).toBe('> Ana:\n> oi\nCorrected');
                expect(reply.get('fallback')[Strophe.NS.REPLY]).toEqual({ start: 0, end: 12 });
                // The original still isn't loaded, so XEP-0428 §2.2 keeps the
                // quote visible, exactly as before the correction.
                expect(reply.getMessageText()).toBe('> Ana:\n> oi\nCorrected');
            }),
        );

        it(
            'carries the quote, the reply and the marker on a corrected sticker reply',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply, addIsacloudQuoteMarker } = replies(_converse);
                const { chat } = await openChat(_converse);
                const sticker = await createOriginal(chat, {
                    body: 'https://upload.example.org/sticker.png',
                    message: 'https://upload.example.org/sticker.png',
                    isacloud_sticker: true,
                });
                const reply = await chat.sendMessage({ body: 'Nice' }, { replying_to: sticker });

                reply.save({ correcting: true });
                await chat.sendMessage({ body: 'Very nice' });
                await u.waitUntil(() => reply.get('edited'));
                // A reply sent before this build has no saved marker flag.
                reply.save({ isacloud_quote_id: undefined });
                reply.save({ is_encrypted: true, plaintext: reply.get('body'), body: 'undecryptable' });

                const stanza = stx`<message xmlns="jabber:client" type="chat">
                    <body>undecryptable</body>
                    <encrypted xmlns="${Strophe.NS.OMEMO}"><payload>x</payload></encrypted>
                </message>`;
                addIsacloudQuoteMarker(chat, addCleartextReply(chat, { message: reply, stanza }));

                const tree = stanzaElement(stanza);
                expect(directChild(tree, 'reply', Strophe.NS.REPLY).getAttribute('id')).toBe(sticker.get('msgid'));
                expect(directChild(tree, 'fallback', Strophe.NS.FALLBACK)).toBeDefined();
                expect(directChild(tree, 'isacloud-quote', NS_ISACLOUD_QUOTE).getAttribute('id')).toBe(
                    sticker.get('msgid'),
                );
                // The quote travels inside the encrypted payload for OMEMO.
                expect(reply.get('plaintext').startsWith('> ')).toBe(true);
            }),
        );

        it(
            'sends <isacloud-quote> for a photo, a GIF and a sticker, never for text',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addIsacloudQuoteMarker, markIsacloudQuote } = replies(_converse);
                const { chat } = await openChat(_converse);

                const photo = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg',
                    message: 'https://upload.example.org/photo.jpg',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                const gif = await createOriginal(chat, {
                    body: 'https://upload.example.org/fun.gif',
                    message: 'https://upload.example.org/fun.gif',
                    media_urls: [{ url: 'https://upload.example.org/fun.gif', start: 0, end: 36, is_gif: true }],
                });
                const sticker = await createOriginal(chat, {
                    body: 'https://upload.example.org/sticker.png',
                    message: 'https://upload.example.org/sticker.png',
                    isacloud_sticker: true,
                });
                const text = await createOriginal(chat, { body: 'Just text', message: 'Just text' });

                for (const original of [photo, gif, sticker]) {
                    const { attrs, message } = await createReply(chat, original.get('msgid'), 'Nice');
                    expect(attrs.isacloud_quote_id).toBe(original.get('msgid'));

                    // Legacy OMEMO: the marker goes outside the encryption.
                    const stanza = stanzaWithBody(message.get('body'), Strophe.NS.OMEMO);
                    addIsacloudQuoteMarker(null, { message, stanza });
                    const tree = stanzaElement(stanza);
                    const marker = directChild(tree, 'isacloud-quote', NS_ISACLOUD_QUOTE);
                    expect(marker).toBeDefined();
                    expect(marker.parentElement).toBe(tree);
                    expect(marker.getAttribute('id')).toBe(original.get('msgid'));
                    expect(directChild(tree, 'encrypted', Strophe.NS.OMEMO)).toBeDefined();
                }

                const text_attrs = markIsacloudQuote(chat, {
                    body: 'Nice',
                    reply_to_id: text.get('msgid'),
                });
                expect(text_attrs.isacloud_quote_id).toBeUndefined();
            }),
        );

        it(
            'sends the <isacloud-quote> and the <reply> with the same id',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addCleartextReply, addIsacloudQuoteMarker } = replies(_converse);
                const { chat } = await openChat(_converse);
                const photo = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg',
                    message: 'https://upload.example.org/photo.jpg',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                const { message } = await createReply(chat, photo.get('msgid'), 'Nice');
                message.save({ is_encrypted: true, plaintext: message.get('body'), body: 'undecryptable' });

                const stanza = stanzaWithBody(message.get('body'), Strophe.NS.OMEMO);
                addIsacloudQuoteMarker(null, addCleartextReply(null, { message, stanza }));

                const tree = stanzaElement(stanza);
                expect(directChild(tree, 'reply', Strophe.NS.REPLY).getAttribute('id')).toBe(photo.get('msgid'));
                expect(directChild(tree, 'isacloud-quote', NS_ISACLOUD_QUOTE).getAttribute('id')).toBe(
                    photo.get('msgid'),
                );
            }),
        );

        it(
            'does not send <isacloud-quote> for an omemo:2-only message',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { addIsacloudQuoteMarker } = replies(_converse);
                const { chat } = await openChat(_converse);
                const photo = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg',
                    message: 'https://upload.example.org/photo.jpg',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                const { message } = await createReply(chat, photo.get('msgid'), 'Nice');
                message.save({ is_encrypted: true, plaintext: message.get('body'), body: 'undecryptable' });

                const stanza = stanzaWithBody(message.get('body'), 'urn:xmpp:omemo:2');
                addIsacloudQuoteMarker(null, { message, stanza });
                expect(directChild(stanzaElement(stanza), 'isacloud-quote', NS_ISACLOUD_QUOTE)).toBeUndefined();
            }),
        );
    });

    describe('quoting media in the fallback', function () {
        it(
            'wraps getReplyQuoteText once and answers with a marker for media',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { isQuoteTextWrapped } = replies(_converse);
                expect(isQuoteTextWrapped()).toBe(true);

                const { chat } = await openChat(_converse);
                const photo = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg',
                    message: 'https://upload.example.org/photo.jpg',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                expect(photo.getReplyQuoteText()).toBe('📷 Photo');

                const gif = await createOriginal(chat, {
                    body: 'https://upload.example.org/fun.gif',
                    message: 'https://upload.example.org/fun.gif',
                    media_urls: [{ url: 'https://upload.example.org/fun.gif', start: 0, end: 36, is_gif: true }],
                });
                expect(gif.getReplyQuoteText()).toBe('🎞️ GIF');

                const video = await createOriginal(chat, {
                    body: 'https://upload.example.org/movie.mp4',
                    message: 'https://upload.example.org/movie.mp4',
                    media_urls: [{ url: 'https://upload.example.org/movie.mp4', start: 0, end: 38, is_video: true }],
                });
                expect(video.getReplyQuoteText()).toBe('🎬 Video');

                const audio = await createOriginal(chat, {
                    body: 'https://upload.example.org/song.mp3',
                    message: 'https://upload.example.org/song.mp3',
                    media_urls: [{ url: 'https://upload.example.org/song.mp3', start: 0, end: 36, is_audio: true }],
                });
                expect(audio.getReplyQuoteText()).toBe('🎵 Audio');

                const sticker = await createOriginal(chat, {
                    body: 'https://upload.example.org/sticker.png',
                    message: 'https://upload.example.org/sticker.png',
                    isacloud_sticker: true,
                });
                expect(sticker.getReplyQuoteText()).toBe('Sticker');

                // A caption is real text: it is quoted instead of a marker.
                const captioned = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg Look at this',
                    message: 'https://upload.example.org/photo.jpg Look at this',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                expect(captioned.getReplyQuoteText()).toBe('https://upload.example.org/photo.jpg Look at this');

                const text = await createOriginal(chat, { body: 'Just text', message: 'Just text' });
                expect(text.getReplyQuoteText()).toBe('Just text');
            }),
        );

        it(
            'quotes the media marker instead of the upload URL in the outgoing fallback',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const { chat } = await openChat(_converse);
                const photo = await createOriginal(chat, {
                    body: 'https://upload.example.org/photo.jpg',
                    message: 'https://upload.example.org/photo.jpg',
                    media_urls: [{ url: 'https://upload.example.org/photo.jpg', start: 0, end: 40, is_image: true }],
                });
                const { attrs } = await createReply(chat, photo.get('msgid'), 'Nice');
                expect(attrs.body).toContain('📷 Photo');
                expect(attrs.body).not.toContain('https://upload.example.org/photo.jpg');
            }),
        );
    });

    describe('wiring', function () {
        it(
            'initializes after the OMEMO plugin, so the legacy <encrypted> is already in the stanza',
            mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
                const initialized = _converse.pluggable.initialized_plugins;
                expect(initialized.indexOf('converse-omemo')).toBeGreaterThan(-1);
                expect(initialized.indexOf('converse-omemo')).toBeLessThan(
                    initialized.indexOf('converse-isacloud-replies'),
                );
            }),
        );
    });
});

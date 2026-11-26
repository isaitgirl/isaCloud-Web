import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = { whitelisted_plugins: ['converse-isacloud-replies'], archived_messages_page_size: 50 };
const PAGE_SIZE = 50;

/** @returns {string} JID of the first roster contact. */
const contactJID = () => mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';

/** @param {any} _converse */
const replies = (_converse) => _converse.exports.isacloud_replies;

/** @type {number} */
let next_time = Date.now();

/** @returns {string} A time that sorts after the previous one. */
function tick() {
    next_time += 1000;
    return new Date(next_time).toISOString();
}

/**
 * Makes `scrollIntoView`, which a browser doesn't need stubbed but jsdom lacks,
 * observable without scrolling the real list.
 * @returns {import('vitest').Mock}
 */
function spyScrollIntoView() {
    if (typeof Element.prototype.scrollIntoView !== 'function') {
        Element.prototype.scrollIntoView = () => {};
    }
    return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
}

/**
 * Opens a 1:1 chat with the first roster contact.
 * @param {any} _converse
 */
async function openChat(_converse) {
    await mock.waitForRoster(_converse, 'current', 1);
    const contact_jid = contactJID();
    const view = await mock.openChatBoxFor(_converse, contact_jid);
    await u.waitUntil(() => view.querySelector('converse-chat-content'));
    return { contact_jid, chat: view.model, view };
}

/**
 * Creates a message model, oldest first by default.
 * @param {any} chat
 * @param {Object} attrs
 */
async function createMessage(chat, attrs = {}) {
    const id = attrs.id ?? u.getUniqueId();
    return chat.createMessage({
        type: 'chat',
        sender: 'them',
        from: chat.get('jid'),
        body: 'A message',
        message: 'A message',
        time: tick(),
        ...attrs,
        id,
        msgid: attrs.msgid ?? id,
    });
}

/**
 * Creates a reply to `reply_to_id`.
 * @param {any} chat
 * @param {string} reply_to_id
 */
async function createReplyTo(chat, reply_to_id) {
    return createMessage(chat, {
        body: 'A reply',
        message: 'A reply',
        reply_to_id,
    });
}

/**
 * The clickable part of the reply card, the one that carries the handler.
 * @param {Element} view
 * @returns {HTMLElement|undefined}
 */
function replyCard(view) {
    return /** @type {HTMLElement|undefined} */ (view.querySelector('converse-reply-context .chat-msg__reply-context'));
}

/**
 * The rendered element of the message with `msgid`.
 * @param {Element} view
 * @param {string} msgid
 * @returns {HTMLElement|undefined}
 */
function messageElement(view, msgid) {
    const articles = /** @type {HTMLElement[]} */ (Array.from(view.querySelectorAll('article[data-msgid]')));
    return articles.find((el) => el.dataset.msgid === msgid);
}

/**
 * The toast text for the active locale of the build under test.
 * @param {any} _converse
 * @returns {string}
 */
const unavailableText = (_converse) =>
    _converse.env.i18n.getLocale() === 'pt_BR' ? 'Mensagem original indisponível' : 'Original message unavailable';

describe('isaCloud reply jump (XEP-0461)', function () {
    it(
        'scrolls to and highlights an original that is already drawn',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const scroll = spyScrollIntoView();
            const content = /** @type {any} */ (view.querySelector('converse-chat-content'));

            const original = await createMessage(chat, { body: 'the original', message: 'the original' });
            await createMessage(chat, { body: 'another one' });
            await createReplyTo(chat, original.get('msgid'));
            await u.waitUntil(() => content.window_bottom === 2);

            const original_el = await u.waitUntil(() => messageElement(view, original.get('msgid')));
            expect(original_el.classList.contains('chat-msg--highlighted')).toBe(false);

            await u.waitUntil(() => replyCard(view));
            replyCard(view).click();

            await u.waitUntil(() =>
                messageElement(view, original.get('msgid'))?.classList.contains('chat-msg--highlighted'),
            );
            expect(scroll).toHaveBeenCalledTimes(1);
            expect(scroll.mock.calls[0][0]).toEqual({ behavior: 'smooth', block: 'center' });
        }),
    );

    it(
        'moves the window to an original that is loaded but outside it',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const scroll = spyScrollIntoView();
            const content = /** @type {any} */ (view.querySelector('converse-chat-content'));

            const original = await createMessage(chat, { body: 'the original', message: 'the original' });
            for (let i = 0; i < 150; i++) {
                await createMessage(chat, { body: `later ${i}`, message: `later ${i}` });
            }
            await createReplyTo(chat, original.get('msgid'));

            await u.waitUntil(() => content.window_bottom === chat.messages.length - 1);
            expect(messageElement(view, original.get('msgid'))).toBeUndefined();
            await u.waitUntil(() => replyCard(view));

            replyCard(view).click();
            await u.waitUntil(() =>
                messageElement(view, original.get('msgid'))?.classList.contains('chat-msg--highlighted'),
            );

            const index = chat.messages.models.indexOf(original);
            expect(content.window_top).toBeLessThanOrEqual(index);
            expect(content.window_bottom).toBeGreaterThanOrEqual(index);
            expect(scroll).toHaveBeenCalledTimes(1);
        }),
    );

    it(
        'loads the original from the archive when it is not held',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const scroll = spyScrollIntoView();

            const original_id = u.getUniqueId();
            const reply = await createReplyTo(chat, original_id);
            const card = await u.waitUntil(() => replyCard(view));
            expect(card.classList.contains('chat-msg__reply-context--unavailable')).toBe(true);

            const held = chat.messages.length;
            const page = vi.spyOn(_converse.api.archive, 'page').mockImplementation(async (target) =>
                Promise.all([
                    target.createMessage({
                        type: 'chat',
                        sender: 'them',
                        from: contactJID(),
                        body: 'the original',
                        message: 'the original',
                        id: original_id,
                        msgid: original_id,
                        time: new Date(Date.parse(reply.get('time')) - 1000).toISOString(),
                    }),
                ]),
            );

            card.click();
            await u.waitUntil(() => messageElement(view, original_id)?.classList.contains('chat-msg--highlighted'));
            expect(page).toHaveBeenCalledTimes(1);
            expect(page.mock.calls[0][1]).toEqual({ limit: held + PAGE_SIZE });
            expect(scroll).toHaveBeenCalledTimes(1);
        }),
    );

    it(
        'says the original is unavailable when the archive has nothing',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            const scroll = spyScrollIntoView();

            await createReplyTo(chat, u.getUniqueId());
            const card = await u.waitUntil(() => replyCard(view));
            const page = vi.spyOn(_converse.api.archive, 'page').mockResolvedValue([]);

            card.click();
            await u.waitUntil(() => toast.mock.calls.length === 1);

            expect(page).toHaveBeenCalledTimes(1);
            expect(toast).toHaveBeenCalledWith('isacloud-reply-unavailable', {
                type: 'info',
                body: unavailableText(_converse),
            });
            expect(view.querySelector('.chat-msg--highlighted')).toBeNull();
            expect(scroll).not.toHaveBeenCalled();
        }),
    );

    it(
        'says the original is unavailable when it was retracted',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});
            const scroll = spyScrollIntoView();

            const original = await createMessage(chat, {
                body: 'the original',
                message: 'the original',
                // `retracted` holds when it happened; `isRetracted()` only checks truthiness.
                retracted: new Date().toISOString(),
            });
            await createReplyTo(chat, original.get('msgid'));
            const card = await u.waitUntil(() => replyCard(view));

            card.click();
            await u.waitUntil(() => toast.mock.calls.length === 1);

            expect(toast.mock.calls[0][0]).toBe('isacloud-reply-unavailable');
            expect(view.querySelector('.chat-msg--highlighted')).toBeNull();
            expect(scroll).not.toHaveBeenCalled();
        }),
    );

    it(
        'stops loading at the ceiling and says the original is unavailable',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            const { chat, view } = await openChat(_converse);
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            const toast = vi.spyOn(_converse.api.toast, 'show').mockImplementation(() => {});

            await createReplyTo(chat, u.getUniqueId());
            const card = await u.waitUntil(() => replyCard(view));

            // The archive keeps answering with unrelated messages, never with
            // the one the reply points at.
            const page = vi.spyOn(_converse.api.archive, 'page').mockImplementation(async (target) => {
                const created = [];
                for (let i = 0; i < PAGE_SIZE; i++) {
                    created.push(await createMessage(target, { body: `filler ${i}`, message: `filler ${i}` }));
                }
                return created;
            });

            card.click();
            await u.waitUntil(() => toast.mock.calls.length === 1);

            expect(page).toHaveBeenCalledTimes(replies(_converse).MAX_LOADED_MESSAGES / PAGE_SIZE);
            expect(replies(_converse).MAX_LOADED_MESSAGES).toBe(200);
        }),
    );

    it(
        'wraps the jump once',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await u.waitUntil(() => replies(_converse).isJumpWrapped());
            expect(replies(_converse).isJumpWrapped()).toBe(true);
            expect(typeof customElements.get('converse-reply-context').prototype.scrollToRepliedMessage).toBe(
                'function',
            );
        }),
    );
});

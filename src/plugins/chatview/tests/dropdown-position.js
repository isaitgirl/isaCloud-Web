import { page, userEvent } from 'vitest/browser';
import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { stx, u } = converse.env;

describe('A message actions dropdown', function () {
    it(
        'stays inside the message area and clear of the composer',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { theme: 'isacloud-dark', view_mode: 'fullscreen' },
            async function (_converse) {
                await page.viewport(390, 620);
                await u.waitUntil(() => window.innerHeight === 620);

                await mock.waitForRoster(_converse, 'current', 1);
                const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
                await mock.openChatBoxFor(_converse, contact_jid);
                const view = _converse.chatboxviews.get(contact_jid);

                for (let i = 0; i < 12; i++) {
                    const stanza = mock.createChatMessage(_converse, contact_jid, `Message ${i + 1}`).tree();
                    // `createChatMessage` derives the id from the current time, which
                    // repeats when stanzas are created back-to-back.
                    stanza.setAttribute('id', `dropdown-position-${i}`);
                    _converse.handleMessageStanza(stanza);
                }
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 12);

                // A tall composer is what makes the menu overlap it: with a short
                // one, the menu already sticks out of the viewport, and Popper's
                // default flip (against the viewport) hides the bug.
                const draft = Array.from({ length: 8 }, (_, i) => `Draft line ${i + 1}`).join('\n');
                await mock.setComposerText(view, draft);
                await u.waitUntil(() => view.querySelector('.chat-textarea')?.getBoundingClientRect().height > 120);

                // The list is `column-reverse`, so 0 is the bottom, where the newest
                // message and its actions are.
                const messages_el = view.querySelector('.chat-content__messages');
                messages_el.scrollTop = 0;
                await u.waitUntil(() => messages_el.scrollTop === 0);

                const toggles = await u.waitUntil(() => {
                    const els = view.querySelectorAll('converse-message-actions converse-dropdown .dropdown-toggle');
                    return els.length === 12 ? els : null;
                });
                const toggle = toggles[toggles.length - 1];
                const msg_el = toggle.closest('converse-chat-message');
                expect(msg_el).not.toBeNull();

                toggle.click();
                const menu = await u.waitUntil(() => msg_el.querySelector('.dropdown-menu.show'));

                // Popper positions the menu asynchronously, after a frame.
                await u.waitUntil(() => {
                    const style = getComputedStyle(menu);
                    return style.position === 'fixed' && menu.getBoundingClientRect().width > 0;
                });

                // The fixed strategy is what lets the menu escape the scroll container.
                const style = getComputedStyle(menu);
                expect(style.position).toBe('fixed');
                expect(parseInt(style.zIndex, 10)).toBeGreaterThan(0);

                const items = Array.from(menu.querySelectorAll('.dropdown-item'));
                expect(items.length).toBeGreaterThan(0);
                for (const item of items) {
                    const rect = item.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    expect(x).toBeGreaterThanOrEqual(0);
                    expect(x).toBeLessThanOrEqual(window.innerWidth);
                    expect(y).toBeGreaterThanOrEqual(0);
                    expect(y).toBeLessThanOrEqual(window.innerHeight);

                    // The item is on-screen, so nothing (the composer in particular)
                    // may sit on top of it.
                    const hit = document.elementFromPoint(x, y);
                    expect(hit).not.toBeNull();
                    expect(item.contains(hit)).toBe(true);
                }

                const menu_rect = menu.getBoundingClientRect();
                const messages_rect = messages_el.getBoundingClientRect();
                const composer_el = await u.waitUntil(() => view.querySelector('.chat-message-form'));
                const composer_rect = composer_el.getBoundingClientRect();
                expect(menu_rect.bottom).toBeLessThanOrEqual(messages_rect.bottom + 1);
                expect(menu_rect.bottom).toBeLessThanOrEqual(composer_rect.top + 1);

                // An outside click closes the menu even when the target stops the
                // event before it reaches `document`: the composer's emoji button
                // does exactly that.
                await userEvent.click(view.querySelector('.toggle-emojis'));
                await u.waitUntil(() => !msg_el.querySelector('.dropdown-menu.show'));

                // Picking an item closes it too.
                const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
                toggle.click();
                await u.waitUntil(() => msg_el.querySelector('.dropdown-menu.show'));
                msg_el.querySelector('.chat-msg__action-copy').click();
                await u.waitUntil(() => !msg_el.querySelector('.dropdown-menu.show'));
                expect(spy).toHaveBeenCalled();
            },
        ),
    );

    it(
        'stays clear of the composer in a groupchat with a short message area',
        mock.initConverse(
            converse,
            ['chatBoxesFetched'],
            { theme: 'isacloud-dark', view_mode: 'fullscreen' },
            async function (_converse) {
                await page.viewport(390, 400);
                await u.waitUntil(() => window.innerHeight === 400);

                const muc_jid = 'lounge@montague.lit';
                await mock.openAndEnterMUC(_converse, muc_jid, 'romeo');
                const view = _converse.chatboxviews.get(muc_jid);
                if (!view.querySelector('.chat-area')) view.renderChatArea();

                const nick = mock.chatroom_names[0];
                const stanza = (from, id, body) => stx`<message xmlns="jabber:client"
                    from="${muc_jid}/${from}"
                    id="${id}"
                    to="${_converse.jid}"
                    type="groupchat">
                    <body>${body}</body>
                </message>`;
                for (let i = 0; i < 11; i++) {
                    await view.model.handleMessageStanza(stanza(nick, `muc-menu-${i}`, `Message ${i + 1}`));
                }
                // Our own message has the most actions, and therefore the tallest menu.
                await view.model.handleMessageStanza(stanza('romeo', 'muc-menu-own', 'My own last message'));
                await u.waitUntil(() => view.querySelectorAll('.chat-msg__text').length === 12);

                // A composer this tall is what leaves too little room for the menu.
                const draft = Array.from({ length: 8 }, (_, i) => `Draft line ${i + 1}`).join('\n');
                await mock.setComposerText(view, draft);
                await u.waitUntil(() => view.querySelector('.chat-textarea')?.getBoundingClientRect().height > 120);

                const messages_el = view.querySelector('.chat-content__messages');
                messages_el.scrollTop = 0;
                await u.waitUntil(() => messages_el.scrollTop === 0);

                const toggles = await u.waitUntil(() => {
                    const els = view.querySelectorAll('converse-message-actions converse-dropdown .dropdown-toggle');
                    return els.length === 12 ? els : null;
                });
                const toggle = toggles[toggles.length - 1];
                const msg_el = toggle.closest('converse-chat-message');
                toggle.click();
                const menu = await u.waitUntil(() => msg_el.querySelector('.dropdown-menu.show'));
                await u.waitUntil(() => menu.getBoundingClientRect().width > 0);

                const menu_rect = menu.getBoundingClientRect();
                const messages_rect = messages_el.getBoundingClientRect();
                const composer_rect = view.querySelector('.chat-message-form').getBoundingClientRect();

                expect(menu_rect.bottom).toBeLessThanOrEqual(messages_rect.bottom + 1);
                expect(menu_rect.bottom).toBeLessThanOrEqual(composer_rect.top + 1);

                // The menu is shorter than its items, so it scrolls instead of
                // spilling over the composer, and the last item is still reachable.
                expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
                expect(getComputedStyle(menu).overflowY).toBe('auto');
                menu.scrollTop = menu.scrollHeight;
                const items = Array.from(menu.querySelectorAll('.dropdown-item'));
                const last_item = items[items.length - 1];
                const rect = last_item.getBoundingClientRect();
                const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                expect(last_item.contains(hit)).toBe(true);
            },
        ),
    );
});

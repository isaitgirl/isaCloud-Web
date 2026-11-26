import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

describe('A toast with an action', function () {
    it(
        'shows a pink action button on the body line and hides the toast once it is clicked',
        mock.initConverse(converse, ['chatBoxesFetched'], { theme: 'isacloud' }, async function (_converse) {
            const handler = vi.fn();
            _converse.api.toast.show('toast-action', {
                'type': 'info',
                'title': 'Vídeo conferência',
                'body': 'Mensagem',
                'action': { 'label': 'Ver', handler },
            });

            const action = await u.waitUntil(() => document.querySelector('converse-toast .toast-action'));
            expect(action.textContent.trim()).toBe('Ver');
            expect(action.getAttribute('type')).toBe('button');

            // The action shares the body's container, keeping both on one line.
            const container = action.closest('.toast-body__container');
            expect(container).not.toBeNull();
            expect(container.querySelector('.toast-body').textContent.trim()).toBe('Mensagem');

            expect(getComputedStyle(action).color).toBe('rgb(255, 0, 111)');

            // The action stays inside the toast's border.
            const toast = action.closest('.toast');
            expect(action.getBoundingClientRect().right).toBeLessThanOrEqual(toast.getBoundingClientRect().right - 4);

            action.click();
            expect(handler).toHaveBeenCalledTimes(1);
            await u.waitUntil(() => !document.querySelector('converse-toast'));
            expect(_converse.api.toast.get('toast-action')).toBeUndefined();
        }),
    );

    it(
        'sits above the message form when placed at the composer',
        mock.initConverse(converse, ['chatBoxesFetched'], { theme: 'isacloud' }, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            const jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await mock.openChatBoxFor(_converse, jid);
            const form = await u.waitUntil(() => view.querySelector('.chat-message-form'));

            _converse.api.toast.show('toast-composer', {
                'type': 'info',
                'body': 'Mensagem',
                'placement': 'composer',
                'appearance': 'light',
            });

            const toast = await u.waitUntil(() => document.querySelector('converse-toast .toast--composer'));
            await u.waitUntil(() => toast.getBoundingClientRect().height > 0);
            expect(getComputedStyle(toast).position).toBe('fixed');
            expect(toast.getBoundingClientRect().bottom).toBeLessThanOrEqual(form.getBoundingClientRect().top + 1);

            // Starts at the conversation card's left edge, not the viewport's right.
            const card = form.closest('.chat-body');
            expect(toast.getBoundingClientRect().left).toBeGreaterThanOrEqual(card.getBoundingClientRect().left + 7);
            expect(toast.getBoundingClientRect().left).toBeLessThanOrEqual(card.getBoundingClientRect().left + 9);

            // Neutral light card instead of the info blue.
            expect(getComputedStyle(toast).backgroundColor).toBe('rgb(233, 237, 240)');
            expect(getComputedStyle(toast).color).toBe('rgb(31, 41, 51)');

            // Above the conversation card, whose flyout uses z-index 2.
            const z_index = parseInt(getComputedStyle(document.querySelector('converse-toasts')).zIndex, 10);
            expect(z_index).toBeGreaterThanOrEqual(1000);
        }),
    );
});

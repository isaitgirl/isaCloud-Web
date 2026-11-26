import { page, userEvent } from 'vitest/browser';
import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

/**
 * @param {EventTarget} target
 * @param {string} type
 * @param {Record<string, any>} [props]
 */
function dispatchPointer(target, type, props = {}) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...props }));
}

describe('The Image Modal', function () {
    it(
        'shows the image at its original size and can be panned by dragging',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await page.viewport(390, 700);
            await u.waitUntil(() => window.innerWidth === 390);

            const { api } = _converse;
            const modal = api.modal.show('converse-image-modal', {
                src: `${window.origin}/base/logo/conversejs-filled-512.png`,
                filename: 'logo.png',
            });
            await modal.initialized;
            await u.waitUntil(() => u.isVisible(modal));

            const img = await u.waitUntil(() => {
                const img = modal.querySelector('img.chat-image--modal');
                return img?.complete && img.naturalWidth > 0 ? img : null;
            });
            const body = modal.querySelector('.modal-body');
            await u.waitUntil(() => body?.clientWidth > 0);

            // Fitted to the modal at first.
            expect(img.classList.contains('chat-image--modal--zoomed')).toBe(false);
            expect(getComputedStyle(img).maxWidth).not.toBe('none');

            // Clicking shows it at its natural size, which is wider than the
            // modal body at this viewport width, so it can be scrolled.
            await userEvent.click(img);
            await u.waitUntil(() => img.classList.contains('chat-image--modal--zoomed'));
            expect(getComputedStyle(img).maxWidth).toBe('none');
            await u.waitUntil(() => body.scrollWidth > body.clientWidth);
            expect(getComputedStyle(body).overflowX).toBe('auto');
            expect(body.scrollLeft).toBe(0);

            // Moving the mouse without holding the button does not pan it.
            dispatchPointer(img, 'pointermove', { 'pointerType': 'mouse', 'clientX': 300, 'clientY': 100 });
            dispatchPointer(img, 'pointermove', { 'pointerType': 'mouse', 'clientX': 250, 'clientY': 100 });
            expect(body.scrollLeft).toBe(0);

            // Drag the image to the left with the mouse, which scrolls the modal
            // body to the right. Pointerup lands on the image, so the browser
            // fires a click on it right after.
            dispatchPointer(img, 'pointerdown', {
                'pointerType': 'mouse',
                'button': 0,
                'clientX': 300,
                'clientY': 100,
            });
            dispatchPointer(img, 'pointermove', { 'pointerType': 'mouse', 'clientX': 200, 'clientY': 100 });
            dispatchPointer(img, 'pointerup', { 'pointerType': 'mouse', 'clientX': 200, 'clientY': 100 });

            // The click that follows the drag must not zoom back out.
            img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await modal.updateComplete;
            expect(img.classList.contains('chat-image--modal--zoomed')).toBe(true);
            await u.waitUntil(() => body.scrollLeft > 50);

            // A separate click does unzoom.
            await userEvent.click(img);
            await u.waitUntil(() => !modal.querySelector('.chat-image--modal--zoomed'));
            await modal.updateComplete;
            expect(getComputedStyle(img).maxWidth).not.toBe('none');
            await u.waitUntil(() => body.scrollLeft === 0);
        }),
    );

    it(
        'sizes the dialog to the image instead of a fixed narrow width',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            await page.viewport(1280, 800);
            await u.waitUntil(() => window.innerWidth === 1280);

            const modal = _converse.api.modal.show('converse-image-modal', {
                src: `${window.origin}/base/logo/conversejs-filled-512.png`,
                filename: 'logo.png',
            });
            await modal.initialized;
            await u.waitUntil(() => u.isVisible(modal));

            const img = await u.waitUntil(() => {
                const img = modal.querySelector('img.chat-image--modal');
                return img?.complete && img.naturalWidth > 0 ? img : null;
            });
            const dialog = modal.querySelector('.modal-dialog');

            // The 512px image fits at its natural width in a dialog sized for it,
            // instead of being shrunk into Bootstrap's 500px dialog.
            await u.waitUntil(() => dialog.getBoundingClientRect().width >= img.naturalWidth);
            const dialog_width = dialog.getBoundingClientRect().width;
            expect(dialog_width).toBeGreaterThanOrEqual(512);
            expect(dialog_width).toBeLessThanOrEqual(620);
            expect(Math.round(img.getBoundingClientRect().width)).toBe(512);
        }),
    );
});

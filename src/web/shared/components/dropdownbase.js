import { createPopper } from '@popperjs/core';
import { constants, log } from '@converse/headless';
import { CustomElement } from './element.js';
import { isComposing } from 'utils/keyboard.js';

const { KEYCODES } = constants;

export default class DropdownBase extends CustomElement {
    /**
     * @param {import('lit').PropertyValues} changed
     */
    firstUpdated(changed) {
        super.firstUpdated(changed);
        this.menu = /** @type { HTMLElement|null} */ (this.querySelector('.dropdown-menu'));
        this.button = /** @type {HTMLButtonElement} */ (this.querySelector('button'));

        /** @param {MouseEvent} ev */
        this._onButtonClick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.toggle();
        };
        this.button.addEventListener('click', this._onButtonClick);
    }

    connectedCallback() {
        super.connectedCallback();
        this.registerEvents();
    }

    disconnectedCallback() {
        this.unregisterEvents();
        if (this._onButtonClick) {
            this.button?.removeEventListener('click', this._onButtonClick);
        }
        if (this._onDocumentClick) {
            document.removeEventListener('pointerdown', this._onDocumentClick, true);
            document.removeEventListener('click', this._onDocumentClick, true);
        }
        if (this._onDocumentKeyDown) {
            document.removeEventListener('keydown', this._onDocumentKeyDown);
        }
        this._popper?.destroy();
        super.disconnectedCallback();
    }

    /**
     * Override in subclass to register event listeners.
     * Called automatically from connectedCallback().
     */
    registerEvents() {}

    /**
     * Override in subclass to unregister event listeners.
     * Called automatically from disconnectedCallback().
     */
    unregisterEvents() {}

    /**
     * Chooses the side of the kebab that the message actions open on and caps
     * their height to the space on that side. Without the cap, a menu taller
     * than a short message area (a phone with the keyboard open, or a composer
     * with panels) is pushed down over the composer.
     * @param {HTMLElement} menu
     * @returns {'left-start'|'left-end'}
     */
    #prepareMenu(menu) {
        menu.style.maxHeight = '';
        menu.style.overflowY = '';
        if (!this.classList.contains('chat-msg__actions')) return 'left-start';

        const boundary = this.closest('.chat-content__messages');
        if (!boundary) return 'left-start';

        const padding = 8;
        const button = this.button.getBoundingClientRect();
        const bounds = boundary.getBoundingClientRect();
        // A `left-end` menu ends at the button's bottom; a `left-start` one starts
        // at its top.
        const space_above = button.bottom - bounds.top - padding;
        const space_below = bounds.bottom - button.top - padding;
        const height = menu.offsetHeight;
        let above;
        if (height <= space_above) {
            above = true;
        } else if (height <= space_below) {
            above = false;
        } else {
            above = space_above >= space_below;
        }
        const available = above ? space_above : space_below;
        if (height > available) {
            menu.style.maxHeight = `${Math.max(80, Math.floor(available))}px`;
            menu.style.overflowY = 'auto';
        }
        return above ? 'left-end' : 'left-start';
    }

    /** Toggle the dropdown's visibility */
    toggle() {
        if (!this.menu) {
            log.error('DropdownBase.toggle called but this.menu is not set');
            return;
        }
        return this.menu.classList.contains('show') ? this.hide() : this.show();
    }

    /** Show the dropdown */
    show() {
        const menu = this.menu;
        if (!menu) {
            log.error('DropdownBase.show called but this.menu is not set');
            return;
        }
        if (menu.classList.contains('show')) return;

        this.button?.classList.add('show');
        this.button?.setAttribute('aria-expanded', 'true');
        menu.classList.add('show');

        // Picking an action closes the menu, as in a native menu, even though
        // the action's own handler ran first.
        if (!this._onMenuItemClick) {
            this._onMenuItemClick = (/** @type {MouseEvent} */ ev) => {
                if (/** @type {HTMLElement} */ (ev.target).closest('.dropdown-item')) this.hide();
            };
        }
        menu.addEventListener('click', this._onMenuItemClick);

        if (this.classList.contains('dropstart')) {
            // The last message's menu would otherwise grow down over the composer. A
            // fixed popper has no clipping parents of its own, so `altBoundary` makes
            // `clippingParents` the message list instead; the menu then flips upward
            // (`left-end`) and `preventOverflow` pads it inside that list.
            this._popper = createPopper(this.button, menu, {
                strategy: 'fixed',
                placement: this.#prepareMenu(menu),
                modifiers: [
                    {
                        name: 'flip',
                        options: {
                            fallbackPlacements: ['left-end', 'right-start', 'right-end'],
                            altBoundary: true,
                        },
                    },
                    {
                        name: 'preventOverflow',
                        options: { boundary: 'clippingParents', altAxis: true, padding: 8, altBoundary: true },
                    },
                ],
            });
        } else {
            this._popper = createPopper(this.button, menu, {
                placement: 'bottom-start',
                modifiers: [{ name: 'flip' }, { name: 'offset', options: { offset: [0, 4] } }],
            });
        }

        // In the capture phase, because the target may stop the event before it
        // reaches `document` (the composer's emoji and attachment buttons do).
        this._onDocumentClick = /** @param {MouseEvent} ev */ (ev) => {
            if (!this.contains(/** @type {Node} */ (ev.target))) {
                this.hide();
            }
        };
        document.addEventListener('pointerdown', this._onDocumentClick, true);
        document.addEventListener('click', this._onDocumentClick, true);

        // Escape must close the dropdown regardless of where focus sits.
        this._onDocumentKeyDown = /** @param {KeyboardEvent} ev */ (ev) => {
            if (ev.key === KEYCODES.ESCAPE && !isComposing(ev)) this.hide();
        };
        document.addEventListener('keydown', this._onDocumentKeyDown);

        this.dispatchEvent(new CustomEvent('converse:dropdown:show', { bubbles: true }));
    }

    /** Hide the dropdown */
    hide() {
        const menu = this.menu;
        if (!menu) {
            log.error('DropdownBase.hide called but this.menu is not set');
            return;
        }
        if (!menu.classList.contains('show')) return;

        this.button?.setAttribute('aria-expanded', 'false');
        this.button?.classList.remove('show');
        menu.classList.remove('show');
        menu.style.maxHeight = '';
        menu.style.overflowY = '';
        if (this._onMenuItemClick) {
            menu.removeEventListener('click', this._onMenuItemClick);
        }

        this._popper?.destroy();
        this._popper = null;

        if (this._onDocumentClick) {
            document.removeEventListener('pointerdown', this._onDocumentClick, true);
            document.removeEventListener('click', this._onDocumentClick, true);
            this._onDocumentClick = null;
        }

        if (this._onDocumentKeyDown) {
            document.removeEventListener('keydown', this._onDocumentKeyDown);
            this._onDocumentKeyDown = null;
        }

        this.dispatchEvent(new CustomEvent('converse:dropdown:hide', { bubbles: true }));
    }
}

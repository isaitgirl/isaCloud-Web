/**
 * @description
 *  isaCloud: the sticker picker (phases 2 and 3), opened from the attachment menu.
 *  Clicking a sticker sends it at once. Right-click, or a long press on touch,
 *  opens a menu to favourite or delete it. "+" picks an image; the editor
 *  (`editor.js`) then replaces the grid in this modal, and "Save" adds the
 *  512 x 512 PNG it makes to the library.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api, log } from '@converse/headless';
import BaseModal from 'plugins/modal/modal.js';
import { addSticker, deleteSticker, listStickers, setFavorite, touchSticker } from './library.js';
import { sendSticker } from './send.js';
import { loadPhoto } from './editor.js';
import { t } from './i18n.js';
import './styles/sticker-modal.scss';

const LONG_PRESS_MS = 500;

/**
 * @param {any} chat - The chat the sticker is sent to.
 */
export function openStickerPicker(chat) {
    api.modal.show('converse-isacloud-stickers-modal', { model: chat });
}

class StickersModal extends BaseModal {
    static get properties() {
        return {
            ...super.properties,
            stickers: { state: true },
            menu_id: { state: true },
            menu_pos: { state: true },
            tab: { type: String },
            view: { state: true },
            photo: { state: true },
        };
    }

    constructor() {
        super();
        /** @type {import('./library.js').StickerRecord[]} */
        this.stickers = [];
        /** @type {string|null} The sticker whose menu is open. */
        this.menu_id = null;
        /** @type {{top: number, left: number}|null} Where the open menu is drawn, in viewport pixels. */
        this.menu_pos = null;
        this.tab = 'all';
        /** @type {'grid'|'editor'} What the modal shows. */
        this.view = 'grid';
        /** @type {ImageBitmap|null} The image being edited. */
        this.photo = null;
        /** @type {Map<string, string>} Object URLs of the stickers on screen. */
        this.urls = new Map();
        this.long_press_timer = null;
        // Set when a long press has opened the menu, so that the click it ends with does nothing.
        this.suppress_click = false;
    }

    async initialize() {
        super.initialize();
        this.addEventListener('hidden.bs.modal', () => this.releaseURLs());
        // A tap outside the open menu closes it.
        this.addEventListener('pointerdown', (ev) => {
            const target = /** @type {Element} */ (ev.target);
            if (this.menu_id && !target.closest('.isacloud-stickers__menu, .isacloud-stickers__item')) {
                this.menu_id = null;
            }
        });
        await this.loadStickers();
    }

    getModalTitle() {
        return this.view === 'editor' ? t('Edit sticker') : t('Stickers');
    }

    renderModalFooter() {
        // The editor has its own Cancel and Save buttons.
        return this.view === 'editor' ? '' : super.renderModalFooter();
    }

    async loadStickers() {
        this.releaseURLs();
        const stickers = await listStickers();
        stickers.forEach((sticker) => this.urls.set(sticker.id, URL.createObjectURL(sticker.blob)));
        this.stickers = stickers;
        this.menu_id = null;
    }

    releaseURLs() {
        this.urls.forEach((url) => URL.revokeObjectURL(url));
        this.urls.clear();
    }

    /** @returns {import('./library.js').StickerRecord[]} */
    visibleStickers() {
        return this.tab === 'favorites' ? this.stickers.filter((sticker) => sticker.favorite) : this.stickers;
    }

    renderModal() {
        if (this.view === 'editor') return this.renderEditor();
        const stickers = this.visibleStickers();
        return html`
            <div class="isacloud-stickers">
                <div class="isacloud-stickers__header">
                    <nav class="nav nav-pills" role="tablist">
                        ${this.renderTab('favorites', t('Favorites'))} ${this.renderTab('all', t('All stickers'))}
                    </nav>
                    <button
                        type="button"
                        class="btn btn-secondary isacloud-stickers__add"
                        title="${t('Create sticker')}"
                        aria-label="${t('Create sticker')}"
                        @click=${() => this.pickImage()}
                    >
                        <converse-icon class="fa fa-plus" size="1em"></converse-icon>
                    </button>
                </div>
                ${stickers.length ? this.renderGrid(stickers) : this.renderEmpty()}
                <input type="file" accept="image/*" hidden @change=${(ev) => this.onImageChosen(ev)} />
            </div>
        `;
    }

    renderEditor() {
        return html`<converse-isacloud-sticker-editor
            .photo=${this.photo}
            @sticker-editor-save=${(ev) => this.onStickerEdited(ev)}
            @sticker-editor-cancel=${() => this.endEdit()}
        ></converse-isacloud-sticker-editor>`;
    }

    /**
     * @param {string} name
     * @param {string} label
     */
    renderTab(name, label) {
        const active = this.tab === name;
        return html`<button
            type="button"
            role="tab"
            class="nav-link ${active ? 'active' : ''}"
            data-name="${name}"
            aria-selected="${active ? 'true' : 'false'}"
            @click=${(ev) => this.switchTab(ev)}
        >
            ${label}
        </button>`;
    }

    /**
     * @param {import('./library.js').StickerRecord[]} stickers
     */
    renderGrid(stickers) {
        return html`<div class="isacloud-stickers__grid" role="list">
            ${stickers.map((sticker) => this.renderSticker(sticker))}
        </div>`;
    }

    /**
     * @param {import('./library.js').StickerRecord} sticker
     */
    renderSticker(sticker) {
        const menu_open = this.menu_id === sticker.id;
        return html`<div class="isacloud-stickers__cell" role="listitem">
            <button
                type="button"
                class="isacloud-stickers__item"
                title="${t('Sticker')}"
                aria-label="${t('Sticker')}"
                @click=${() => this.onStickerClicked(sticker)}
                @contextmenu=${(ev) => this.onContextMenu(ev, sticker)}
                @pointerdown=${(ev) => this.onPointerDown(ev, sticker)}
                @pointerup=${() => this.cancelLongPress()}
                @pointerleave=${() => this.cancelLongPress()}
                @pointercancel=${() => this.cancelLongPress()}
                @pointermove=${() => this.cancelLongPress()}
            >
                <img src="${this.urls.get(sticker.id)}" alt="${t('Sticker')}" draggable="false" />
            </button>
            ${menu_open ? this.renderMenu(sticker) : ''}
        </div>`;
    }

    /**
     * @param {import('./library.js').StickerRecord} sticker
     */
    renderMenu(sticker) {
        const pos = this.menu_pos ?? { top: 0, left: 0 };
        return html`<ul class="isacloud-stickers__menu" role="menu" style="${`top: ${pos.top}px; left: ${pos.left}px`}">
            <li role="none">
                <button
                    type="button"
                    role="menuitem"
                    class="isacloud-stickers__menu-item"
                    @click=${() => this.toggleFavorite(sticker)}
                >
                    ${sticker.favorite ? t('Remove from favorites') : t('Favorite')}
                </button>
            </li>
            <li role="none">
                <button
                    type="button"
                    role="menuitem"
                    class="isacloud-stickers__menu-item isacloud-stickers__menu-item--danger"
                    @click=${() => this.removeSticker(sticker)}
                >
                    ${t('Delete')}
                </button>
            </li>
        </ul>`;
    }

    renderEmpty() {
        const favorites = this.tab === 'favorites';
        return html`<div class="isacloud-stickers__empty">
            <p>${favorites ? t('No favorite stickers yet') : t('No stickers yet')}</p>
            ${
                favorites
                    ? ''
                    : html`<button type="button" class="btn btn-primary" @click=${() => this.pickImage()}>
                          ${t('Create sticker')}
                      </button>`
            }
        </div>`;
    }

    /** @param {PointerEvent} ev */
    onPointerDown(ev, sticker) {
        this.suppress_click = false;
        if (ev.pointerType !== 'touch') return;
        this.cancelLongPress();
        const item = /** @type {HTMLElement} */ (ev.currentTarget);
        this.long_press_timer = setTimeout(() => {
            this.long_press_timer = null;
            this.suppress_click = true;
            this.openMenu(item, sticker);
        }, LONG_PRESS_MS);
    }

    cancelLongPress() {
        clearTimeout(this.long_press_timer);
        this.long_press_timer = null;
    }

    /**
     * @param {MouseEvent} ev
     * @param {import('./library.js').StickerRecord} sticker
     */
    onContextMenu(ev, sticker) {
        ev.preventDefault();
        this.openMenu(/** @type {HTMLElement} */ (ev.currentTarget), sticker);
    }

    /**
     * Opens the menu of a sticker below it. The menu is positioned in viewport
     * pixels (`position: fixed`), because the modal body clips anything that
     * overflows it, and a short grid would hide the menu.
     * @param {HTMLElement} item - The sticker's button
     * @param {import('./library.js').StickerRecord} sticker
     */
    openMenu(item, sticker) {
        const rect = item.getBoundingClientRect();
        const width = 200;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        this.menu_pos = { top: rect.bottom + 4, left };
        this.menu_id = sticker.id;
    }

    /** @param {import('./library.js').StickerRecord} sticker */
    async onStickerClicked(sticker) {
        if (this.suppress_click) {
            this.suppress_click = false;
            return;
        }
        this.close();
        try {
            await touchSticker(sticker.id);
            await sendSticker(this.model, sticker.blob);
        } catch (e) {
            log.error(e);
            api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not save the sticker') });
        }
    }

    /** @param {import('./library.js').StickerRecord} sticker */
    async toggleFavorite(sticker) {
        await setFavorite(sticker.id, !sticker.favorite);
        await this.loadStickers();
    }

    /** @param {import('./library.js').StickerRecord} sticker */
    async removeSticker(sticker) {
        this.menu_id = null;
        const confirmed = await api.confirm(t('Delete sticker?'));
        if (!confirmed) return;
        await deleteSticker(sticker.id);
        await this.loadStickers();
    }

    pickImage() {
        /** @type {HTMLInputElement} */ (this.querySelector('input[type="file"]')).click();
    }

    /** @param {Event} ev */
    async onImageChosen(ev) {
        const input = /** @type {HTMLInputElement} */ (ev.target);
        const file = input.files?.[0];
        // Cleared so that choosing the same image again counts as a new choice.
        input.value = '';
        if (!file) return;
        try {
            this.photo?.close();
            this.photo = await loadPhoto(file);
            this.view = 'editor';
        } catch (e) {
            log.error(e);
            api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not open the image') });
        }
    }

    /**
     * Leaves the editor, without saving, and shows the grid again.
     */
    endEdit() {
        this.photo?.close();
        this.photo = null;
        this.view = 'grid';
    }

    /** @param {CustomEvent<Blob>} ev - The PNG the editor made. */
    async onStickerEdited(ev) {
        try {
            if (!(await addSticker(ev.detail))) throw new Error('The sticker could not be stored');
        } catch (e) {
            log.error(e);
            api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not save the sticker') });
            return;
        }
        this.endEdit();
        await this.loadStickers();
    }
}

api.elements.define('converse-isacloud-stickers-modal', StickersModal);

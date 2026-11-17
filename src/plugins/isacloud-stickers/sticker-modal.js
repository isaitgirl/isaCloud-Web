/**
 * @description
 *  isaCloud: the sticker picker (phases 2 to 3, plus the GIF import of phase
 *  1c), opened from the attachment menu. Clicking a sticker sends it at once.
 *  Right-click, or a long press on
 *  touch, opens a menu to favourite or delete it. "+" picks an image; the editor
 *  (`editor.js`) then replaces the grid in this modal, and "Save" adds the
 *  512 x 512 PNG it makes to the library. The import view takes a GIF, from a
 *  direct link or from a file, previews it and sends it untouched, so that it
 *  keeps animating (`import.js`).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api, log } from '@converse/headless';
import BaseModal from 'plugins/modal/modal.js';
import { addSticker, deleteSticker, listStickers, setFavorite, touchSticker } from './library.js';
import { sendSticker } from './send.js';
import { loadPhoto } from './editor.js';
import { gifFromURL, importGif } from './import.js';
import { MAX_STICKER_BYTES, detectStickerFormat } from './format.js';
import { IMPORT_ICON } from './icon.js';
import { t } from './i18n.js';
import './styles/sticker-modal.scss';

const LONG_PRESS_MS = 500;

/**
 * The text for a failed import, translated; the hint, when there is one, says
 * what to try next.
 * @param {any} error
 * @returns {{ text: string, hint: string|null }}
 */
function importErrorText(error) {
    switch (error?.code) {
        case 'invalid-url':
        case 'not-gif':
            return { text: t('The link is not a GIF'), hint: null };
        case 'too-large':
            return { text: t('The GIF is too large'), hint: null };
        case 'timeout':
            return { text: t('Could not download the GIF'), hint: t('The download took too long') };
        case 'store':
            return { text: t('Could not import the sticker'), hint: null };
        case 'download':
        default:
            return { text: t('Could not download the GIF'), hint: t('The site did not allow downloading this GIF.') };
    }
}

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
            import_url: { state: true },
            import_error: { state: true },
            import_error_hint: { state: true },
            import_loading: { state: true },
            import_sending: { state: true },
            import_blob: { state: true },
            import_preview: { state: true },
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
        /** @type {'grid'|'editor'|'import'} What the modal shows. */
        this.view = 'grid';
        /** @type {ImageBitmap|null} The image being edited. */
        this.photo = null;
        /** @type {Map<string, string>} Object URLs of the stickers on screen. */
        this.urls = new Map();
        /** @type {string} What was typed in the import view's URL field. */
        this.import_url = '';
        /** @type {string|null} Why the import failed, already translated. */
        this.import_error = null;
        /** @type {string|null} A second line under the error, with a way out. */
        this.import_error_hint = null;
        /** @type {boolean} Whether a GIF is being downloaded. */
        this.import_loading = false;
        /** @type {boolean} Whether the chosen GIF is being stored and sent. */
        this.import_sending = false;
        /** @type {Blob|null} The GIF that was downloaded or chosen. */
        this.import_blob = null;
        /** @type {string|null} Object URL of the chosen GIF, for the preview. */
        this.import_preview = null;
        this.long_press_timer = null;
        // Set when a long press has opened the menu, so that the click it ends with does nothing.
        this.suppress_click = false;
    }

    async initialize() {
        super.initialize();
        this.addEventListener('hidden.bs.modal', () => {
            this.releaseURLs();
            this.resetImport();
        });
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
        if (this.view === 'import') return t('Import sticker');
        return this.view === 'editor' ? t('Edit sticker') : t('Stickers');
    }

    renderModalFooter() {
        // The editor and the import view have their own Cancel and Save/Send buttons.
        return this.view === 'grid' ? super.renderModalFooter() : '';
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
        if (this.view === 'import') return this.renderImport();
        const stickers = this.visibleStickers();
        return html`
            <div class="isacloud-stickers">
                <div class="isacloud-stickers__header">
                    <nav class="nav nav-pills" role="tablist">
                        ${this.renderTab('favorites', t('Favorites'))} ${this.renderTab('all', t('All stickers'))}
                    </nav>
                    <div class="isacloud-stickers__actions">
                        <button
                            type="button"
                            class="btn btn-secondary isacloud-stickers__import-button"
                            title="${t('Import GIF')}"
                            aria-label="${t('Import GIF')}"
                            @click=${() => this.startImport()}
                        >
                            <converse-icon class="fa ${IMPORT_ICON}" size="1em"></converse-icon>
                        </button>
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
                </div>
                ${stickers.length ? this.renderGrid(stickers) : this.renderEmpty()}
                <input
                    type="file"
                    class="isacloud-stickers__image-file"
                    accept="image/*"
                    hidden
                    @change=${(ev) => this.onImageChosen(ev)}
                />
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

    renderImport() {
        const busy = this.import_loading || this.import_sending;
        const prompt = t('Paste a direct GIF link (ending in .gif)');
        return html`<div class="isacloud-stickers__import">
            <p class="isacloud-stickers__intro">${t('Send a GIF from a link or from this device.')}</p>

            <form class="isacloud-stickers__url" @submit=${(ev) => this.onURLSubmit(ev)}>
                <label class="isacloud-stickers__label" for="isacloud-stickers-import-url">${prompt}</label>
                <div class="isacloud-stickers__url-row">
                    <input
                        id="isacloud-stickers-import-url"
                        type="url"
                        inputmode="url"
                        autocomplete="off"
                        class="form-control isacloud-stickers__url-input"
                        placeholder="${prompt}"
                        .value=${this.import_url}
                        ?disabled=${busy}
                        @input=${(ev) => (this.import_url = /** @type {HTMLInputElement} */ (ev.target).value)}
                    />
                    <button type="submit" class="btn btn-secondary isacloud-stickers__load" ?disabled=${busy}>
                        ${t('Load')}
                    </button>
                </div>
            </form>

            <div class="isacloud-stickers__file-row">
                <button
                    type="button"
                    class="btn btn-secondary isacloud-stickers__choose"
                    ?disabled=${busy}
                    @click=${() => this.pickGIF()}
                >
                    ${t('Choose GIF file')}
                </button>
                <input
                    type="file"
                    class="isacloud-stickers__file"
                    accept="image/gif,.gif"
                    hidden
                    @change=${(ev) => this.onGIFChosen(ev)}
                />
            </div>

            ${this.import_preview ? this.renderImportPreview() : ''}
            ${
                this.import_error
                    ? html`<p class="isacloud-stickers__error" role="alert">
                          ${this.import_error}
                          ${
                              this.import_error_hint
                                  ? html`<span class="isacloud-stickers__error-hint">${this.import_error_hint}</span>`
                                  : ''
                          }
                      </p>`
                    : ''
            }
            ${
                busy
                    ? html`<p class="isacloud-stickers__status" role="status">
                          ${this.import_sending ? t('Sending…') : t('Loading…')}
                      </p>`
                    : ''
            }

            <div class="isacloud-stickers__import-actions">
                <button
                    type="button"
                    class="btn btn-secondary isacloud-stickers__import-cancel"
                    @click=${() => this.endImport()}
                >
                    ${t('Cancel')}
                </button>
                <button
                    type="button"
                    class="btn btn-primary isacloud-stickers__import-send"
                    ?disabled=${busy || !this.import_blob}
                    @click=${() => this.sendImport()}
                >
                    ${t('Send as sticker')}
                </button>
            </div>
        </div>`;
    }

    renderImportPreview() {
        return html`<div class="isacloud-stickers__preview">
            <img src="${this.import_preview}" alt="${t('Preview')}" />
        </div>`;
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
        if ((await detectStickerFormat(file)) === 'gif') {
            // The editor would redraw it as a PNG and lose the animation: a GIF is
            // imported as it is, from the view that keeps its bytes.
            this.startImport();
            await this.acceptGIF(file);
            return;
        }
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

    /**
     * Shows the import view, with nothing chosen yet.
     */
    startImport() {
        this.resetImport();
        this.view = 'import';
    }

    /**
     * Leaves the import view, discarding the chosen GIF, and shows the grid again.
     */
    endImport() {
        this.resetImport();
        this.view = 'grid';
    }

    /**
     * Forgets the URL, the chosen GIF and the messages of the import view.
     */
    resetImport() {
        this.releaseImportPreview();
        this.import_url = '';
        this.import_error = null;
        this.import_error_hint = null;
        this.import_loading = false;
        this.import_sending = false;
    }

    /**
     * Revokes the preview's object URL, which the browser would keep otherwise.
     */
    releaseImportPreview() {
        if (this.import_preview) URL.revokeObjectURL(this.import_preview);
        this.import_preview = null;
        this.import_blob = null;
    }

    /** @param {Blob} blob */
    showImportPreview(blob) {
        this.releaseImportPreview();
        this.import_blob = blob;
        this.import_preview = URL.createObjectURL(blob);
        this.import_error = null;
        this.import_error_hint = null;
    }

    /**
     * @param {SubmitEvent|Event} ev
     */
    async onURLSubmit(ev) {
        ev.preventDefault();
        if (this.import_loading || this.import_sending) return;
        this.import_error = null;
        this.import_error_hint = null;
        this.releaseImportPreview();
        this.import_loading = true;
        try {
            const blob = await gifFromURL(this.import_url.trim());
            // The user may have gone back to the grid while it downloaded.
            if (this.view === 'import') this.showImportPreview(blob);
        } catch (e) {
            log.error(e);
            const { text, hint } = importErrorText(e);
            this.import_error = text;
            this.import_error_hint = hint;
        } finally {
            this.import_loading = false;
        }
    }

    pickGIF() {
        /** @type {HTMLInputElement} */ (this.querySelector('.isacloud-stickers__file')).click();
    }

    /** @param {Event} ev */
    async onGIFChosen(ev) {
        const input = /** @type {HTMLInputElement} */ (ev.target);
        const file = input.files?.[0];
        // Cleared so that choosing the same file again counts as a new choice.
        input.value = '';
        if (file) await this.acceptGIF(file);
    }

    /**
     * Checks a chosen file and shows it as the preview. Nothing else is a GIF:
     * the name and the type are ignored, as everywhere in the plugin.
     * @param {File} file
     * @returns {Promise<boolean>} Whether the file is the chosen GIF now.
     */
    async acceptGIF(file) {
        this.releaseImportPreview();
        this.import_error = null;
        this.import_error_hint = null;
        if (file.size > MAX_STICKER_BYTES) {
            this.import_error = t('The GIF is too large');
            return false;
        }
        if ((await detectStickerFormat(file)) !== 'gif') {
            this.import_error = t('The file is not a GIF');
            return false;
        }
        this.showImportPreview(file);
        return true;
    }

    async sendImport() {
        if (!this.import_blob || this.import_loading || this.import_sending) return;
        this.import_sending = true;
        this.import_error = null;
        this.import_error_hint = null;
        try {
            await importGif(this.model, this.import_blob);
        } catch (e) {
            log.error(e);
            // The GIF stays in the view, so that the user can try again.
            this.import_error = t('Could not import the sticker');
            this.import_sending = false;
            api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not save the sticker') });
            return;
        }
        this.resetImport();
        this.view = 'grid';
        this.close();
        api.toast.show('isacloud-sticker-saved', { type: 'success', body: t('Sticker saved') });
        await this.loadStickers();
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

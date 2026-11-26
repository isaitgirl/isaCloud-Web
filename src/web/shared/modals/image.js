import BaseModal from 'plugins/modal/modal.js';
import tplImageModal from './templates/image.js';
import { __ } from 'i18n';
import { api } from '@converse/headless';
import { getFileName } from 'utils/html.js';
import { html, nothing } from 'lit';

import './styles/image.scss';

class ImageModal extends BaseModal {
    /** @type {{x: number, y: number, scrollLeft: number, scrollTop: number}|null} */
    #dragStart = null;

    #dragged = false;

    // Set when a drag ends, so that the click the browser fires afterwards
    // doesn't zoom the image back out.
    #suppressClick = false;

    /**
     * @param {Record<string, any>} options
     */
    constructor(options) {
        super(options);
        this.src = options.src;
        // The original filename, used as the `download` name when `src` is an
        // opaque `blob:` URL (e.g. a decrypted OMEMO image). See #2632.
        this.filename = options.filename;
        this.state.set('zoomed', false);
    }

    /**
     * The modal body is the scroll container while zoomed, so it's looked up
     * when needed rather than cached, since Lit may re-render it.
     * @returns {HTMLElement|null}
     */
    #getScroller() {
        return /** @type {HTMLElement|null} */ (this.querySelector('.modal-body'));
    }

    /**
     * Show the image at its natural size (zoomed in), or fit it to the modal
     * again (zoomed out).
     */
    async toggleZoom() {
        this.state.set('zoomed', !this.state.get('zoomed'));
        await this.updateComplete;
        const body = this.#getScroller();
        if (body) {
            body.scrollLeft = 0;
            body.scrollTop = 0;
        }
    }

    /**
     * Widen the dialog to the image's natural width (plus the modal body's
     * padding), capped to the viewport. A fixed modal width made wide screenshots
     * render as a narrow, very tall column.
     * @param {HTMLImageElement} img
     */
    #sizeDialog(img) {
        if (!img?.naturalWidth) return;
        const max = Math.min(window.innerWidth * 0.92, 1100);
        const min = Math.min(360, max);
        const desired = Math.max(min, Math.min(img.naturalWidth + 42, max));
        this.style.setProperty('--image-modal-width', `${Math.round(desired)}px`);
    }

    #onLoad = (/** @type {Event} */ ev) => {
        this.#sizeDialog(/** @type {HTMLImageElement} */ (ev.target));
    };

    #onResize = () => {
        const img = /** @type {HTMLImageElement|null} */ (this.querySelector('img.chat-image--modal'));
        if (img?.complete) this.#sizeDialog(img);
    };

    updated() {
        // Cached images can be complete before the `load` listener runs.
        const img = /** @type {HTMLImageElement|null} */ (this.querySelector('img.chat-image--modal'));
        if (img?.complete) this.#sizeDialog(img);
    }

    #onClick = () => {
        if (this.#suppressClick) {
            this.#suppressClick = false;
            return;
        }
        this.toggleZoom();
    };

    /**
     * @param {PointerEvent} ev
     */
    #onPointerDown = (ev) => {
        // A new gesture invalidates a suppression left over from a drag whose
        // click never arrived.
        this.#suppressClick = false;
        // Touch scrolls natively; only the mouse needs the image dragged.
        if (!this.state.get('zoomed') || ev.pointerType !== 'mouse' || ev.button !== 0) return;
        const body = this.#getScroller();
        if (!body) return;
        // Deliberately not calling `preventDefault` here: cancelling
        // `pointerdown` also suppresses the compatibility `click`, which would
        // stop a plain click from toggling the zoom. The browser's own image
        // drag is prevented by the template instead.
        this.#dragStart = {
            x: ev.clientX,
            y: ev.clientY,
            scrollLeft: body.scrollLeft,
            scrollTop: body.scrollTop,
        };
        this.#dragged = false;
        // Listen on `window`, and not with `setPointerCapture`, so that the
        // drag keeps working outside the image (and for synthetic events).
        window.addEventListener('pointermove', this.#onPointerMove);
        window.addEventListener('pointerup', this.#onPointerUp);
    };

    /**
     * @param {PointerEvent} ev
     */
    #onPointerMove = (ev) => {
        const body = this.#getScroller();
        if (!body || !this.#dragStart) return;
        const dx = ev.clientX - this.#dragStart.x;
        const dy = ev.clientY - this.#dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
            this.#dragged = true;
        }
        body.scrollLeft = this.#dragStart.scrollLeft - dx;
        body.scrollTop = this.#dragStart.scrollTop - dy;
    };

    /**
     * @param {PointerEvent} ev
     */
    #onPointerUp = (ev) => {
        // `click` is only fired when the pointer comes back up over the image;
        // suppress that one click if this gesture was a drag. The flag is
        // cleared by the click handler, and by the next pointerdown otherwise,
        // so there is no timer racing the click.
        const suppress = this.#dragged && this.contains(/** @type {Node} */ (ev.target));
        this.#removeDragListeners();
        this.#dragStart = null;
        this.#suppressClick = suppress;
    };

    #removeDragListeners() {
        window.removeEventListener('pointermove', this.#onPointerMove);
        window.removeEventListener('pointerup', this.#onPointerUp);
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('resize', this.#onResize);
    }

    disconnectedCallback() {
        window.removeEventListener('resize', this.#onResize);
        this.#removeDragListeners();
        this.#dragStart = null;
        super.disconnectedCallback();
    }

    renderModal() {
        return tplImageModal({
            'src': this.src,
            'zoomed': this.state.get('zoomed'),
            'onClick': this.#onClick,
            'onLoad': this.#onLoad,
            'onPointerDown': this.#onPointerDown,
        });
    }

    getModalTitle() {
        const filename = this.filename || getFileName(this.src);
        return html`${__('Image: ')}<a
                target="_blank"
                rel="noopener"
                download="${this.filename || nothing}"
                href="${this.src}"
                >${filename}</a
            >`;
    }
}

api.elements.define('converse-image-modal', ImageModal);

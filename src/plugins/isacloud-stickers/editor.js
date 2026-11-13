/**
 * @description
 *  isaCloud: the sticker editor (phase 3), shown inside the stickers modal
 *  after an image is picked with "+". The photo is cropped to a square (drag
 *  to move, wheel or pinch to zoom); texts are added with "Aa", moved by
 *  dragging, resized with the wheel or pinch and coloured. "Save" sends the
 *  512 x 512 PNG to the modal (`sticker-editor-save`), "Cancel" leaves
 *  without saving (`sticker-editor-cancel`). Drawing is in `render.js`.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api, log } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import {
    clamp,
    clampOffset,
    drawSticker,
    exportSticker,
    layoutText,
    SCALE_MAX,
    SCALE_MIN,
    TEXT_COLORS,
    ZOOM_MAX,
    ZOOM_MIN,
} from './render.js';
import { t } from './i18n.js';
import './styles/sticker-editor.scss';

/** The longest side of the photo kept in memory, in pixels. */
export const PHOTO_MAX = 1024;
const WHEEL_STEP = 1.1;

/** Names of the colour swatches, in the order of `TEXT_COLORS`. */
const COLOR_NAMES = () => [t('White'), t('Black'), t('Yellow'), t('Pink'), t('Blue')];

/**
 * Decodes the chosen image, downscaled so that its longest side is at most PHOTO_MAX.
 * @param {Blob} blob
 * @returns {Promise<ImageBitmap>} Rejects when the image cannot be decoded.
 */
export async function loadPhoto(blob) {
    const original = await createImageBitmap(blob);
    const longest = Math.max(original.width, original.height);
    if (longest <= PHOTO_MAX) return original;
    const scale = PHOTO_MAX / longest;
    try {
        return await createImageBitmap(original, {
            resizeWidth: Math.round(original.width * scale),
            resizeHeight: Math.round(original.height * scale),
            resizeQuality: 'high',
        });
    } finally {
        original.close();
    }
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class StickerEditor extends CustomElement {
    static get properties() {
        return {
            photo: { type: Object },
            selected: { state: true },
            exporting: { state: true },
            typing: { state: true },
        };
    }

    constructor() {
        super();
        /** @type {ImageBitmap|null} */
        this.photo = null;
        /** @type {{ photo: any, zoom: number, offset: {x: number, y: number}, texts: any[] }} */
        this.sticker = { photo: null, zoom: 1, offset: { x: 0, y: 0 }, texts: [] };
        /** @type {string|null} The id of the selected text. */
        this.selected = null;
        this.exporting = false;
        this.typing = false;
        /** @type {Map<number, {x: number, y: number}>} Pointers on the preview, in CSS pixels. */
        this.pointers = new Map();
        /** @type {any} The gesture in progress. */
        this.gesture = null;
        this.resize_observer = null;
    }

    willUpdate(changed) {
        if (changed.has('photo')) {
            this.sticker = { photo: this.photo, zoom: 1, offset: { x: 0, y: 0 }, texts: [] };
            this.selected = null;
        }
    }

    firstUpdated() {
        const canvas = this.canvas();
        // Not passive, so that the wheel does not scroll the modal behind the preview.
        canvas.addEventListener('wheel', (ev) => this.onWheel(ev), { passive: false });
        this.resize_observer = new ResizeObserver(() => this.paint());
        this.resize_observer.observe(canvas);
    }

    disconnectedCallback() {
        this.resize_observer?.disconnect();
        super.disconnectedCallback();
    }

    updated() {
        this.paint();
    }

    /** @returns {HTMLCanvasElement} */
    canvas() {
        return /** @type {HTMLCanvasElement} */ (this.querySelector('canvas.sticker-editor__canvas'));
    }

    /** Draws the sticker on the preview, at the device's pixel density. */
    paint() {
        const canvas = this.canvas();
        const css_side = canvas?.getBoundingClientRect().width;
        if (!canvas || !css_side) return;
        const side = Math.round(css_side * (window.devicePixelRatio || 1));
        if (canvas.width !== side) {
            canvas.width = side;
            canvas.height = side;
        }
        drawSticker(/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), side, this.sticker);
    }

    /** @returns {number} The width of the preview in CSS pixels. */
    cssSide() {
        return this.canvas().getBoundingClientRect().width;
    }

    /**
     * @param {PointerEvent|WheelEvent} ev
     * @returns {{x: number, y: number}} The point in CSS pixels, from the preview's corner.
     */
    localPoint(ev) {
        const rect = this.canvas().getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    /** @returns {any|undefined} The selected text. */
    selectedText() {
        return this.sticker.texts.find((item) => item.id === this.selected);
    }

    /**
     * @param {{x: number, y: number}} point - In CSS pixels.
     * @returns {any|undefined} The top-most text under the point.
     */
    textAt(point) {
        const side = this.cssSide();
        const texts = [...this.sticker.texts].reverse();
        return texts.find((item) => {
            const layout = layoutText(item, side);
            if (!layout.lines.length) return false;
            return (
                Math.abs(point.x - layout.cx) <= layout.width / 2 && Math.abs(point.y - layout.cy) <= layout.height / 2
            );
        });
    }

    /**
     * Selects a text, or none with null. A text left empty is removed, as it has nothing to show.
     * @param {string|null} id
     */
    select(id) {
        if (this.selected && this.selected !== id) {
            const previous = this.sticker.texts.find((item) => item.id === this.selected);
            if (previous && !previous.text.trim()) {
                this.sticker.texts = this.sticker.texts.filter((item) => item !== previous);
            }
        }
        this.selected = id;
    }

    addText() {
        const item = { id: crypto.randomUUID(), text: '', color_index: 0, x: 0.5, y: 0.5, scale: 1 };
        this.sticker.texts = [...this.sticker.texts, item];
        this.select(item.id);
        this.requestUpdate();
        // Focus after the input is rendered; the keyboard then opens on phones.
        this.updateComplete.then(() =>
            /** @type {HTMLInputElement|null} */ (this.querySelector('input.sticker-editor__input'))?.focus(),
        );
    }

    removeSelected() {
        this.sticker.texts = this.sticker.texts.filter((item) => item.id !== this.selected);
        this.selected = null;
        this.requestUpdate();
    }

    /**
     * Zooms the selected text, or the photo when no text is selected.
     * @param {number} value - The new scale or zoom.
     * @param {any} [target] - The selected text, if any.
     */
    applyZoom(value, target) {
        if (target) {
            target.scale = clamp(value, SCALE_MIN, SCALE_MAX);
        } else {
            this.sticker.zoom = clamp(value, ZOOM_MIN, ZOOM_MAX);
            this.sticker.offset = clampOffset(this.sticker);
        }
        this.requestUpdate();
    }

    /** @param {PointerEvent} ev */
    onPointerDown(ev) {
        if (ev.button !== 0) return;
        this.canvas().setPointerCapture(ev.pointerId);
        const point = this.localPoint(ev);
        this.pointers.set(ev.pointerId, point);
        if (this.pointers.size === 1) {
            const hit = this.textAt(point);
            this.select(hit?.id ?? null);
            this.gesture = hit
                ? { type: 'text', item: hit, start: point, x0: hit.x, y0: hit.y }
                : { type: 'pan', start: point, offset0: { ...this.sticker.offset } };
        } else if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            const target = this.selectedText();
            this.gesture = {
                type: 'pinch',
                distance: distance(a, b),
                target,
                base: target ? target.scale : this.sticker.zoom,
            };
        }
        this.requestUpdate();
    }

    /** @param {PointerEvent} ev */
    onPointerMove(ev) {
        if (!this.pointers.has(ev.pointerId) || !this.gesture) return;
        const point = this.localPoint(ev);
        this.pointers.set(ev.pointerId, point);
        const side = this.cssSide();
        const g = this.gesture;
        if (g.type === 'pan') {
            const offset = {
                x: g.offset0.x + (point.x - g.start.x) / side,
                y: g.offset0.y + (point.y - g.start.y) / side,
            };
            this.sticker.offset = clampOffset({ ...this.sticker, offset });
        } else if (g.type === 'text') {
            g.item.x = clamp(g.x0 + (point.x - g.start.x) / side, 0, 1);
            g.item.y = clamp(g.y0 + (point.y - g.start.y) / side, 0, 1);
        } else if (g.type === 'pinch' && this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            const ratio = distance(a, b) / g.distance;
            this.applyZoom(g.base * ratio, g.target);
            return;
        }
        this.requestUpdate();
    }

    /** @param {PointerEvent} ev */
    onPointerUp(ev) {
        this.pointers.delete(ev.pointerId);
        if (this.pointers.size === 0) {
            this.gesture = null;
        } else if (this.gesture?.type === 'pinch') {
            // One finger left after a pinch does nothing until it touches again.
            this.gesture = null;
        }
    }

    /** @param {WheelEvent} ev */
    onWheel(ev) {
        ev.preventDefault();
        const factor = ev.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
        const target = this.selectedText();
        const current = target ? target.scale : this.sticker.zoom;
        this.applyZoom(current * factor, target);
    }

    /** @param {Event} ev */
    onTextInput(ev) {
        const item = this.selectedText();
        if (!item) return;
        item.text = /** @type {HTMLInputElement} */ (ev.target).value;
        this.requestUpdate();
    }

    /** @param {number} color_index */
    setColor(color_index) {
        const item = this.selectedText();
        if (!item) return;
        item.color_index = color_index;
        this.requestUpdate();
    }

    onTextFocus() {
        this.typing = true;
        // On a phone the keyboard covers the lower part of the editor: bring the colours into view.
        setTimeout(() => this.querySelector('.sticker-editor__colors')?.scrollIntoView({ block: 'nearest' }), 300);
    }

    async save() {
        if (this.exporting) return;
        this.exporting = true;
        try {
            const png = await exportSticker(this.sticker);
            this.dispatchEvent(new CustomEvent('sticker-editor-save', { detail: png }));
        } catch (e) {
            log.error(e);
            api.toast.show('isacloud-sticker-error', { type: 'danger', body: t('Could not save the sticker') });
        } finally {
            this.exporting = false;
        }
    }

    renderTextControls(item) {
        const names = COLOR_NAMES();
        return html`<div class="sticker-editor__text">
            <div class="sticker-editor__text-row">
                <input
                    type="text"
                    class="form-control sticker-editor__input"
                    aria-label="${t('Text')}"
                    placeholder="${t('Text')}"
                    .value=${item.text}
                    @input=${(ev) => this.onTextInput(ev)}
                    @focus=${() => this.onTextFocus()}
                    @blur=${() => (this.typing = false)}
                />
                <button
                    type="button"
                    class="btn btn-secondary sticker-editor__remove"
                    title="${t('Remove text')}"
                    aria-label="${t('Remove text')}"
                    @click=${() => this.removeSelected()}
                >
                    <converse-icon class="fa fa-trash" size="1em"></converse-icon>
                </button>
            </div>
            <div class="sticker-editor__colors" role="radiogroup">
                ${TEXT_COLORS.map(
                    (color, index) =>
                        html`<button
                            type="button"
                            role="radio"
                            aria-checked="${index === item.color_index ? 'true' : 'false'}"
                            aria-label="${names[index]}"
                            title="${names[index]}"
                            class="sticker-editor__swatch ${index === item.color_index ? 'sticker-editor__swatch--selected' : ''}"
                            style="${`background: ${color}`}"
                            @click=${() => this.setColor(index)}
                        ></button>`,
                )}
            </div>
        </div>`;
    }

    render() {
        const item = this.selectedText();
        return html`<div class="sticker-editor ${this.typing ? 'sticker-editor--typing' : ''}">
            <div class="sticker-editor__stage">
                <canvas
                    class="sticker-editor__canvas"
                    @pointerdown=${(ev) => this.onPointerDown(ev)}
                    @pointermove=${(ev) => this.onPointerMove(ev)}
                    @pointerup=${(ev) => this.onPointerUp(ev)}
                    @pointercancel=${(ev) => this.onPointerUp(ev)}
                ></canvas>
                <div class="sticker-editor__frame" aria-hidden="true"></div>
            </div>
            <div class="sticker-editor__toolbar">
                <button
                    type="button"
                    class="btn btn-secondary sticker-editor__add-text"
                    title="${t('Add text')}"
                    aria-label="${t('Add text')}"
                    @click=${() => this.addText()}
                >
                    Aa
                </button>
            </div>
            ${item ? this.renderTextControls(item) : ''}
            <div class="sticker-editor__footer">
                <button
                    type="button"
                    class="btn btn-secondary sticker-editor__cancel"
                    @click=${() => this.dispatchEvent(new CustomEvent('sticker-editor-cancel'))}
                >
                    ${t('Cancel')}
                </button>
                <button
                    type="button"
                    class="btn btn-primary sticker-editor__save"
                    ?disabled=${this.exporting}
                    @click=${() => this.save()}
                >
                    ${t('Save')}
                </button>
            </div>
        </div>`;
    }
}

api.elements.define('converse-isacloud-sticker-editor', StickerEditor);

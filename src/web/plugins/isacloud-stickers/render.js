/**
 * @description
 *  isaCloud: draws a sticker (phase 3). One function, `drawSticker`, paints
 *  the editor's preview and the 512 x 512 PNG, so both look the same. Every
 *  measure is a fraction of the side, as on iOS (`Stickers.swift`), so the
 *  stickers of both platforms match.
 *
 *  The state is `{ photo, zoom, offset: {x, y}, texts }`:
 *  - `photo`: an ImageBitmap (or any drawable with width and height);
 *  - `zoom`: 1..4, the photo's zoom over the cover fit;
 *  - `offset`: the photo's centre from the square's centre, as fractions of the side;
 *  - `texts`: `{ id, text, color_index, x, y, scale }`, with x and y the centre
 *    (0..1) and scale 0.4..3.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { STICKER_SIZE } from './image.js';

/** The margin around the crop square, as a fraction of the side. */
export const MARGIN = 0.06;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const SCALE_MIN = 0.4;
export const SCALE_MAX = 3;

/** Text colours, in the order of the editor's swatches. */
export const TEXT_COLORS = ['#ffffff', '#000000', '#ffd60a', '#ff006f', '#1780ad'];
/** Index of black text, which gets a white outline. */
export const BLACK_TEXT = 1;

const TEXT_FONT_FAMILY = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';
const TEXT_SIZE = 0.11;
const LINE_HEIGHT = 1.15;
const MAX_WIDTH = 0.9;
const OUTLINE = 0.008;

/** Measures text for the layout; the font is set on each call. */
const measure_context = document.createElement('canvas').getContext('2d');

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} side
 * @returns {number} The side of the crop square.
 */
export function frameSize(side) {
    return side * (1 - 2 * MARGIN);
}

/**
 * The scale that makes the photo cover the crop square (in pixels for `frame`).
 * @param {{ width: number, height: number }} photo
 * @param {number} frame
 */
function coverBase(photo, frame) {
    return Math.max(frame / photo.width, frame / photo.height);
}

/**
 * How far the photo may move from the centre, as fractions of the side, so that
 * the crop square never shows empty space. Same formula as iOS `photoLimit()`.
 * @param {{ photo: any, zoom: number }} state
 * @returns {{ x: number, y: number }}
 */
export function photoLimit({ photo, zoom }) {
    if (!photo) return { x: 0, y: 0 };
    const frame = frameSize(1);
    const base = coverBase(photo, frame);
    return {
        x: Math.max(0, (photo.width * base * zoom - frame) / 2),
        y: Math.max(0, (photo.height * base * zoom - frame) / 2),
    };
}

/**
 * @param {{ photo: any, zoom: number, offset: { x: number, y: number } }} state
 * @returns {{ x: number, y: number }} The offset, clamped to `photoLimit`.
 */
export function clampOffset(state) {
    const limit = photoLimit(state);
    return {
        x: clamp(state.offset.x, -limit.x, limit.x),
        y: clamp(state.offset.y, -limit.y, limit.y),
    };
}

/**
 * @param {number} color_index
 * @returns {string} The outline colour: white for black text, black for the others.
 */
export function outlineColor(color_index) {
    return color_index === BLACK_TEXT ? '#ffffff' : '#000000';
}

/**
 * Splits one paragraph into lines no wider than `max_width`, breaking on spaces.
 * A word wider than the limit is broken by characters.
 * @param {string} paragraph
 * @param {number} max_width
 * @param {(line: string) => number} width - Measures a line.
 * @returns {string[]}
 */
function wrapParagraph(paragraph, max_width, width) {
    const lines = [];
    let line = '';
    for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (width(candidate) <= max_width) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        line = '';
        let rest = word;
        while (width(rest) > max_width && rest.length > 1) {
            let cut = rest.length - 1;
            while (cut > 1 && width(rest.slice(0, cut)) > max_width) cut--;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        line = rest;
    }
    lines.push(line);
    return lines;
}

/**
 * Lays out one text on a square of `side` pixels: the wrapped lines, their
 * size, and the centre of the block. Used by the drawing and by the hit test.
 * @param {{ text: string, scale: number, x: number, y: number }} item
 * @param {number} side
 * @returns {{ font: string, lines: string[], lineHeight: number, width: number, height: number,
 *   cx: number, cy: number, top: number, thickness: number }}
 */
export function layoutText(item, side) {
    const size = side * TEXT_SIZE * item.scale;
    const font = `900 ${size}px ${TEXT_FONT_FAMILY}`;
    measure_context.font = font;
    const width = (/** @type {string} */ line) => measure_context.measureText(line).width;
    const lines = item.text.trim()
        ? item.text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, side * MAX_WIDTH, width))
        : [];
    const lineHeight = size * LINE_HEIGHT;
    const height = lines.length * lineHeight;
    const cy = item.y * side;
    return {
        font,
        lines,
        lineHeight,
        width: lines.reduce((widest, line) => Math.max(widest, width(line)), 0),
        height,
        cx: item.x * side,
        cy,
        top: cy - height / 2,
        thickness: Math.max(1, side * OUTLINE * item.scale),
    };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} side
 * @param {any} state
 */
function drawPhoto(ctx, side, state) {
    const { photo, zoom, offset } = state;
    const frame = frameSize(side);
    const base = coverBase(photo, frame) * zoom;
    const width = photo.width * base;
    const height = photo.height * base;
    const centre_x = side / 2 + offset.x * side;
    const centre_y = side / 2 + offset.y * side;
    ctx.save();
    ctx.beginPath();
    ctx.rect((side - frame) / 2, (side - frame) / 2, frame, frame);
    ctx.clip();
    ctx.drawImage(photo, centre_x - width / 2, centre_y - height / 2, width, height);
    ctx.restore();
}

/**
 * Texts are not clipped, so they can sit in the transparent margin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} side
 * @param {any} item
 */
function drawText(ctx, side, item) {
    const layout = layoutText(item, side);
    if (!layout.lines.length) return;
    const fill = TEXT_COLORS[item.color_index] ?? TEXT_COLORS[0];
    const y_of = (/** @type {number} */ i) => layout.top + layout.lineHeight * (i + 0.5);
    ctx.save();
    ctx.font = layout.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * layout.thickness;
    ctx.strokeStyle = outlineColor(item.color_index);
    ctx.fillStyle = fill;
    // The outline of the whole text goes under the fill, as iOS draws it.
    layout.lines.forEach((line, i) => ctx.strokeText(line, layout.cx, y_of(i)));
    layout.lines.forEach((line, i) => ctx.fillText(line, layout.cx, y_of(i)));
    ctx.restore();
}

/**
 * Paints the sticker on a square canvas of `side` pixels (the canvas must be
 * that size). Outside the photo and the texts it stays transparent.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} side
 * @param {{ photo: any, zoom: number, offset: { x: number, y: number }, texts: any[] }} state
 */
export function drawSticker(ctx, side, state) {
    ctx.clearRect(0, 0, side, side);
    if (state.photo) drawPhoto(ctx, side, state);
    for (const item of state.texts) drawText(ctx, side, item);
}

/**
 * @param {{ photo: any, zoom: number, offset: { x: number, y: number }, texts: any[] }} state
 * @returns {Promise<Blob>} The sticker as a 512 x 512 PNG with a transparent background.
 */
export async function exportSticker(state) {
    const canvas = document.createElement('canvas');
    canvas.width = STICKER_SIZE;
    canvas.height = STICKER_SIZE;
    drawSticker(/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), STICKER_SIZE, state);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (png) => (png ? resolve(png) : reject(new Error('The sticker could not be encoded as PNG'))),
            'image/png',
        ),
    );
}

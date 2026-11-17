/**
 * @description
 *  isaCloud: the sticker icons, drawn as SVG symbols added to the page next to
 *  Converse's Font Awesome sprite, so that `<converse-icon class="fa ...">` and
 *  attachment menu items draw them in the button's colour. `fa-isacloud-sticker`
 *  is a square card with its top right corner folded inwards and a smile inside;
 *  `fa-isacloud-sticker-import` is an arrow going down into a tray, for the
 *  button that imports a GIF.
 * @license Mozilla Public License (MPLv2)
 */

export const STICKER_ICON = 'fa-isacloud-sticker';
export const IMPORT_ICON = 'fa-isacloud-sticker-import';

const SYMBOL_ID = 'icon-isacloud-sticker';
const IMPORT_SYMBOL_ID = 'icon-isacloud-sticker-import';

// viewBox 0 0 512 512. The card, with a notch where the corner was folded and
// the eyes and mouth cut out (even-odd), then the folded flap inside the notch.
const CARD =
    'M96 32H252a24 24 0 0 1 24 24V212a24 24 0 0 0 24 24H456a24 24 0 0 1 24 24V416a64 64 0 0 1-64 64H96a64 64 0 0 1-64-64V96a64 64 0 0 1 64-64Z' +
    'M128 300a38 38 0 1 0 76 0a38 38 0 1 0-76 0Z' +
    'M262 300a38 38 0 1 0 76 0a38 38 0 1 0-76 0Z' +
    'M120 362Q234 484 348 362Q234 412 120 362Z';
const FLAP = 'M304 32L480 208H328a24 24 0 0 1-24-24Z';

// Arrow into a tray, drawn in one colour: the arrow, then the open tray below it.
const IMPORT_ARROW = 'M232 32h48v152h64l-88 104-88-104h64z';
const IMPORT_TRAY = 'M96 328h56v56a8 8 0 0 0 8 8h192a8 8 0 0 0 8-8v-56h56v56a64 64 0 0 1-64 64H160a64 64 0 0 1-64-64z';

/**
 * Adds one hidden symbol, which `<converse-icon>` looks up by id.
 * @param {SVGElement} svg
 * @param {string} id
 * @param {string[]} paths
 */
function addSymbol(svg, id, paths) {
    const NS = 'http://www.w3.org/2000/svg';
    const symbol = document.createElementNS(NS, 'symbol');
    symbol.id = id;
    symbol.setAttribute('viewBox', '0 0 512 512');
    for (const d of paths) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill-rule', 'evenodd');
        symbol.appendChild(path);
    }
    svg.appendChild(symbol);
}

/**
 * Adds the symbols to the page once.
 * @returns {void}
 */
export function registerStickerIcon() {
    if (typeof document === 'undefined' || document.getElementById(SYMBOL_ID)) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'display: none;');
    svg.classList.add('isacloud-sticker-icon-sprite');
    addSymbol(svg, SYMBOL_ID, [CARD, FLAP]);
    addSymbol(svg, IMPORT_SYMBOL_ID, [IMPORT_ARROW, IMPORT_TRAY]);
    document.body.prepend(svg);
}

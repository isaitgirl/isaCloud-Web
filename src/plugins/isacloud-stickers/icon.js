/**
 * @description
 *  isaCloud: the sticker icon, a square card with its top right corner folded
 *  inwards and a smile inside. It is added to the page as a hidden SVG symbol
 *  named `icon-isacloud-sticker`, next to Converse's Font Awesome sprite, so
 *  that `<converse-icon class="fa fa-isacloud-sticker">` and attachment menu
 *  items with `icon: 'fa-isacloud-sticker'` draw it in the button's colour.
 * @license Mozilla Public License (MPLv2)
 */

export const STICKER_ICON = 'fa-isacloud-sticker';

const SYMBOL_ID = 'icon-isacloud-sticker';

// viewBox 0 0 512 512. The card, with a notch where the corner was folded and
// the eyes and mouth cut out (even-odd), then the folded flap inside the notch.
const CARD =
    'M96 32H252a24 24 0 0 1 24 24V212a24 24 0 0 0 24 24H456a24 24 0 0 1 24 24V416a64 64 0 0 1-64 64H96a64 64 0 0 1-64-64V96a64 64 0 0 1 64-64Z' +
    'M128 300a38 38 0 1 0 76 0a38 38 0 1 0-76 0Z' +
    'M262 300a38 38 0 1 0 76 0a38 38 0 1 0-76 0Z' +
    'M120 362Q234 484 348 362Q234 412 120 362Z';
const FLAP = 'M304 32L480 208H328a24 24 0 0 1-24-24Z';

/**
 * Adds the symbol to the page once.
 * @returns {void}
 */
export function registerStickerIcon() {
    if (typeof document === 'undefined' || document.getElementById(SYMBOL_ID)) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'display: none;');
    svg.classList.add('isacloud-sticker-icon-sprite');
    const symbol = document.createElementNS(NS, 'symbol');
    symbol.id = SYMBOL_ID;
    symbol.setAttribute('viewBox', '0 0 512 512');
    for (const d of [CARD, FLAP]) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill-rule', 'evenodd');
        symbol.appendChild(path);
    }
    svg.appendChild(symbol);
    document.body.prepend(svg);
}

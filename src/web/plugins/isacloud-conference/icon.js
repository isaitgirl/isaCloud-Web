/**
 * @description
 *  isaCloud: the video conference icon, drawn as an SVG symbol added to the
 *  page next to Converse's Font Awesome sprite, so that
 *  `<converse-icon class="fa fa-isacloud-conference">` and the toolbar button
 *  draw it in the button's colour. Converse has no camera icon in its sprite,
 *  so the plugin carries its own.
 * @license Mozilla Public License (MPLv2)
 */

export const CONFERENCE_ICON = 'fa-isacloud-conference';

const SYMBOL_ID = 'icon-isacloud-conference';

// viewBox 0 0 512 512: a rounded camera body that fills the box, with the lens
// cut out of it (same path, even-odd) and the lens hood on the right.
const CAMERA = [
    'M80 64h224a48 48 0 0 1 48 48v288a48 48 0 0 1-48 48H80a48 48 0 0 1-48-48V112a48 48 0 0 1 48-48Z' +
        'M112 256a80 80 0 1 0 160 0a80 80 0 1 0-160 0Z',
    'M352 160l160-96v384l-160-96z',
];

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
 * Adds the symbol to the page once.
 * @returns {void}
 */
export function registerConferenceIcon() {
    if (typeof document === 'undefined' || document.getElementById(SYMBOL_ID)) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'display: none;');
    svg.classList.add('isacloud-conference-icon-sprite');
    addSymbol(svg, SYMBOL_ID, CAMERA);
    document.body.prepend(svg);
}

/**
 * @description
 *  isaCloud: pt-BR strings of the replies plugin, the same pattern as the
 *  stickers plugin (`src/plugins/isacloud-stickers/i18n.js`): no `.po` edits,
 *  and Converse's `__()` is used for every other locale.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'Photo': 'Foto',
    'GIF': 'GIF',
    'Video': 'Vídeo',
    'Audio': 'Áudio',
    'Sticker': 'Figurinha',
    'Original message unavailable': 'Mensagem original indisponível',
};

/**
 * @returns {string} The active locale, such as `pt_BR` or `en`.
 */
function activeLocale() {
    // `getLocale` is added by the UI's i18n module, which runs before any plugin UI.
    const { getLocale } = /** @type {{ getLocale?: () => string }} */ (/** @type {any} */ (i18n));
    return getLocale?.() ?? 'en';
}

/**
 * @param {string} english - The English source text, which is also the key.
 * @returns {string}
 */
export function t(english) {
    if (activeLocale() === 'pt_BR') return PT_BR[english] ?? __(english);
    return __(english);
}

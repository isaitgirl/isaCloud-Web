/**
 * @description
 *  isaCloud: strings of the update plugin, in pt-BR without touching the `.po`
 *  files (as in the stickers plugin).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'New version available, click to update': 'Nova versão disponível, clique para atualizar',
};

/**
 * @param {string} english - The English source text, which is also the key.
 * @returns {string}
 */
export function t(english) {
    const { getLocale } = /** @type {{ getLocale?: () => string }} */ (/** @type {any} */ (i18n));
    if ((getLocale?.() ?? 'en') === 'pt_BR') return PT_BR[english] ?? __(english);
    return __(english);
}

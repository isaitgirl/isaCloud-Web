/**
 * @description
 *  isaCloud: strings of the video conference plugin, in pt-BR without touching
 *  the `.po` files. When Converse's active locale is pt_BR, the Portuguese text
 *  is used; otherwise Converse's `__()` gets the English text.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'Start a video conference': 'Iniciar uma vídeo conferência',
    'Video conference': 'Vídeo conferência',
    'Access the video conference via the link:': 'Acesse a vídeo conferência pelo link:',
    'Could not create the conference. Please try again.': 'Não foi possível criar a conferência. Tente novamente.',
    'Conference created. The link is in the message field.': 'Conferência criada. O link está na caixa de mensagem.',
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

/**
 * @description
 *  isaCloud: strings of the changelog plugin, in pt-BR without touching the
 *  `.po` files (as in the stickers and update plugins).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'What’s new in isaCloud': 'Novidades do isaCloud',
    'What’s new in isaCloud Web': 'Novidades do isaCloud Web',
    'See what changed in the latest versions.': 'Veja o que mudou nas últimas versões.',
    'View what’s new in isaCloud Web': 'Ver novidades do isaCloud Web',
    'See what changed in version %1$s': 'Veja o que mudou na %1$s',
    'See what changed in versions %1$s': 'Veja o que mudou nas %1$s',
    'New': 'Novo',
    'Archive news': 'Arquivar novidades',
    'News archived. You can reopen it in Settings → About.':
        'Novidades arquivadas. Você pode reabrir em Configurações → Sobre.',
    'Back to conversations': 'Voltar para as conversas',
    'Version %1$s • %2$s': 'Versão %1$s • %2$s',
    'Show in conversation list': 'Mostrar na lista de conversas',
    'Open full changelog on GitHub': 'Histórico completo no GitHub',
    'No news for now.': 'Nenhuma novidade por aqui.',
    'Click to open the isaCloud news': 'Clique para abrir as novidades do isaCloud',
};

/**
 * Replace `%1$s`, `%2$s`, … in a pt-BR string without pulling sprintf in.
 * @param {string} template
 * @param {(string|number)[]} args
 * @returns {string}
 */
function format(template, args) {
    return template.replace(/%(\d+)\$s/g, (match, index) => {
        const value = args[Number(index) - 1];
        return value === undefined ? match : String(value);
    });
}

/**
 * @param {string} english - The English source text, which is also the key.
 * @param {...(string|number)} args
 * @returns {string}
 */
export function t(english, ...args) {
    const { getLocale } = /** @type {{ getLocale?: () => string }} */ (/** @type {any} */ (i18n));
    if ((getLocale?.() ?? 'en') === 'pt_BR') return format(PT_BR[english] ?? english, args);
    return __(english, ...args);
}

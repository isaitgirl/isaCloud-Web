/**
 * @description
 *  isaCloud: strings of the stickers plugin, in pt-BR without touching the
 *  `.po` files. When Converse's active locale is pt_BR, the Portuguese text
 *  is used; otherwise Converse's `__()` gets the English text.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'Stickers': 'Figurinhas',
    'Sticker': 'Figurinha',
    'Favorites': 'Favoritas',
    'All stickers': 'Todas',
    'Create sticker': 'Criar figurinha',
    'No stickers yet': 'Nenhuma figurinha ainda',
    'No favorite stickers yet': 'Nenhuma figurinha favorita ainda',
    'Favorite': 'Favoritar',
    'Remove from favorites': 'Remover dos favoritos',
    'Delete': 'Excluir',
    'Delete sticker?': 'Excluir figurinha?',
    'Save sticker': 'Salvar figurinha',
    'Sticker saved': 'Figurinha salva',
    'Could not save the sticker': 'Não foi possível salvar a figurinha',
    'Choose photo': 'Escolher foto',
    'Edit sticker': 'Editar figurinha',
    'Text': 'Texto',
    'Add text': 'Adicionar texto',
    'Remove text': 'Remover texto',
    'Save': 'Salvar',
    'Cancel': 'Cancelar',
    'Could not open the image': 'Não foi possível abrir a imagem',
    'White': 'Branco',
    'Black': 'Preto',
    'Yellow': 'Amarelo',
    'Pink': 'Rosa',
    'Blue': 'Azul',
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

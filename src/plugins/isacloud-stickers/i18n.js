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
    'Import sticker': 'Importar figurinha',
    'Import GIF': 'Importar GIF',
    'Choose GIF file': 'Escolher arquivo GIF',
    'Paste a direct GIF link (ending in .gif)': 'Cole o endereço direto do GIF (termina em .gif)',
    'Send a GIF from a link or from this device.': 'Envie um GIF por um link ou deste aparelho.',
    'Load': 'Carregar',
    'Loading…': 'Carregando…',
    'Sending…': 'Enviando…',
    'Send as sticker': 'Enviar como figurinha',
    'Preview': 'Prévia',
    'Back': 'Voltar',
    'Could not download the GIF': 'Não foi possível baixar o GIF',
    'The site did not allow downloading this GIF.': 'O site não permitiu baixar este GIF.',
    'The download took too long': 'O download demorou demais',
    'The link is not a GIF': 'O link não é um GIF',
    'The file is not a GIF': 'O arquivo não é um GIF',
    'The GIF is too large': 'O GIF é grande demais',
    'Could not import the sticker': 'Não foi possível importar a figurinha',
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

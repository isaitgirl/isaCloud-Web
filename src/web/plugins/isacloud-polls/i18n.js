/**
 * @description
 *  isaCloud: strings of the polls plugin, in pt-BR without touching the `.po`
 *  files. When Converse's active locale is pt_BR, the Portuguese text is used;
 *  otherwise Converse's `__()` gets the English text.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'Poll': 'Enquete',
    'Poll options': 'Opções da enquete',
    'Select one or more options': 'Selecione uma ou mais opções',
    'Vote to see the results': 'Vote para ver os resultados',
    'No votes yet': 'Nenhum voto ainda',
    '1 vote': '1 voto',
    '%1$s votes': '%1$s votos',
    'Poll closed': 'Enquete encerrada',
    'Ended on %1$s': 'Encerrada em %1$s',
    'Ends on %1$s': 'Termina em %1$s',
    'Final result': 'Resultado final',
    'Your vote': 'Seu voto',
    'Create poll': 'Criar enquete',
    'Question': 'Pergunta',
    'Description (optional)': 'Descrição (opcional)',
    'Options': 'Opções',
    'Option': 'Opção',
    'Add option': 'Adicionar opção',
    'Remove option': 'Remover opção',
    'Allow multiple choices': 'Permitir múltiplas escolhas',
    'Hide results until voting': 'Ocultar resultados até votar',
    'Create': 'Criar',
    'Cancel': 'Cancelar',
    'Fill in the question and at least two options.': 'Preencha a pergunta e pelo menos duas opções.',
    'End poll': 'Encerrar enquete',
    'End poll?': 'Encerrar enquete?',
    'The result is frozen and the poll cannot be reopened.':
        'O resultado é congelado e a enquete não pode ser reaberta.',
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
 * @param {...(string|number)} args - Values for `%1$s`, `%2$s`, …
 * @returns {string}
 */
export function t(english, ...args) {
    const locale = activeLocale();
    if (!args.length) return locale === 'pt_BR' ? (PT_BR[english] ?? __(english)) : __(english);
    const template = locale === 'pt_BR' ? (PT_BR[english] ?? english) : english;
    return template.replace(/%(\d+)\$s/g, (_, index) => String(args[Number(index) - 1] ?? ''));
}

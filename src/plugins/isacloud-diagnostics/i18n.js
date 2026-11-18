/**
 * @description
 *  isaCloud: strings of the diagnostics plugin, in pt-BR without touching the
 *  `.po` files (as in the stickers and update plugins).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { i18n } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Record<string, string>} */
const PT_BR = {
    'Connection diagnostics': 'Diagnóstico de conexão',
    'Connection report': 'Relatório de conexão',
    'Diagnostics': 'Diagnóstico',
    'Report': 'Relatório',
    'Open diagnostics': 'Abrir diagnóstico',
    'Send diagnostics': 'Enviar diagnóstico',
    'Send report': 'Enviar relatório',
    'Send diagnostic report': 'Enviar relatório de diagnóstico',
    'Report diagnostics': 'Relatório de diagnóstico',
    'Download diagnostics': 'Baixar diagnóstico',
    'Download report': 'Baixar relatório',
    'Download file': 'Baixar arquivo',
    'Download': 'Baixar',
    'Send': 'Enviar',
    'Sending…': 'Enviando…',
    'Sent': 'Enviado',
    'Failed': 'Falhou',
    'Close': 'Fechar',
    'Cancel': 'Cancelar',
    'Clear': 'Apagar',
    'Clear logs': 'Apagar logs',
    'Delete logs': 'Apagar logs',
    'Clear diagnostics': 'Apagar diagnósticos',
    'Clear all diagnostics?': 'Apagar todos os diagnósticos?',
    'The diagnostics were cleared': 'Os diagnósticos foram apagados',
    'Diagnostics are disabled': 'O diagnóstico está desligado',
    'What happened? (optional)': 'O que aconteceu? (opcional)',
    'What happened?': 'O que aconteceu?',
    'Optional note': 'Observação opcional',
    'The report includes times of disconnections, connection type, browser version and technical errors. It does not include the content of your messages.':
        'O relatório inclui horários de queda, tipo de conexão, versão do navegador e erros técnicos. Não inclui o conteúdo das suas mensagens.',
    'The report does not include the content of your messages.':
        'O relatório não inclui o conteúdo das suas mensagens.',
    'Reports go to reports@isacloud.im': 'Os relatórios vão para reports@isacloud.im',
    'Test recipient': 'Destinatário do teste',
    'Normally reports@isacloud.im': 'Normalmente reports@isacloud.im',
    'Enter a valid XMPP address for the test.': 'Informe um endereço XMPP válido para o teste.',
    'Send to reports@isacloud.im': 'Enviar para reports@isacloud.im',
    'Send report to reports@isacloud.im': 'Enviar relatório para reports@isacloud.im',
    'Last 24 hours': 'Últimas 24 h',
    'Last 24 h': 'Últimas 24 h',
    'Last 24 h: %1$s disconnects, %2$s reconnects': 'Últimas 24 h: %1$s quedas, %2$s reconexões',
    'Last 24 h: %1$s disconnects, %2$s reconnects, last one %3$s ago':
        'Últimas 24 h: %1$s quedas, %2$s reconexões, a última há %3$s',
    'Disconnects': 'Quedas',
    'Reconnects': 'Reconexões',
    'Last disconnect': 'Última queda',
    'Last reconnect': 'Última reconexão',
    'Total events': 'Total de eventos',
    'Events': 'Eventos',
    'No disconnections recorded': 'Nenhuma queda registrada',
    'No events recorded': 'Nenhum evento registrado',
    'No events in the last 24 hours': 'Nenhum evento nas últimas 24 h',
    'Retention': 'Retenção',
    'Now': 'Agora',
    'Current status': 'Estado atual',
    'Connected': 'Conectado',
    'Not connected': 'Sem conexão',
    'Reconnecting…': 'Reconectando…',
    'Connecting…': 'Conectando…',
    'Disconnected': 'Desconectado',
    'Authenticated': 'Autenticado',
    'Not authenticated': 'Não autenticado',
    'Transport': 'Transporte',
    'Attempt': 'Tentativa',
    'attempts': 'tentativas',
    'Online': 'Online',
    'Offline': 'Offline',
    'Visible': 'Visível',
    'Hidden': 'Oculta',
    'Test connection': 'Testar conexão',
    'Test': 'Testar',
    'Testing…': 'Testando…',
    'Test diagnostics (drops the connection)': 'Testar diagnóstico (derruba a conexão)',
    'This drops the connection for a few seconds. It is only a test; nothing is sent. Continue?':
        'Isto derruba a conexão por alguns segundos. É só um teste; nada é enviado. Continuar?',
    'Connection dropped for the test': 'Conexão derrubada para o teste',
    'Connection is back': 'A conexão voltou',
    'The connection is working': 'A conexão está funcionando',
    'The connection test failed': 'O teste de conexão falhou',
    'Send a test message': 'Enviar uma mensagem de teste',
    'Not connected. Download the file and send it when the connection is back.':
        'Sem conexão. Baixe o arquivo e envie quando a conexão voltar.',
    'Sending is only available when connected and OMEMO is ready.':
        'O envio só está disponível quando há conexão e o OMEMO está pronto.',
    'Download works without a connection.': 'O download funciona sem conexão.',
    'OMEMO is not available for this report. Download the file instead.':
        'O OMEMO não está disponível para este relatório. Baixe o arquivo.',
    'OMEMO is not available for this contact. Download the file instead.':
        'O OMEMO não está disponível para este contato. Baixe o arquivo.',
    'OMEMO is not enabled in this conversation. Download the file instead.':
        'O OMEMO não está ativo nesta conversa. Baixe o arquivo.',
    'The upload service is not available. Download the file instead.':
        'O serviço de envio de arquivos não está disponível. Baixe o arquivo.',
    'The report was sent': 'O relatório foi enviado',
    'The report was sent.': 'O relatório foi enviado.',
    'The report could not be sent': 'Não foi possível enviar o relatório',
    'The report could not be sent. Download the file instead.': 'Não foi possível enviar o relatório. Baixe o arquivo.',
    'Could not create the report': 'Não foi possível criar o relatório',
    'Could not prepare the report': 'Não foi possível preparar o relatório',
    'Could not download the report': 'Não foi possível baixar o relatório',
    'Could not send the report': 'Não foi possível enviar o relatório',
    'Diagnostics cleared': 'Diagnósticos apagados',
    'Report downloaded': 'Relatório baixado',
    'Download started': 'Download iniciado',
    'No diagnostics recorded yet': 'Nenhum diagnóstico registrado ainda',
    'Not available': 'Não disponível',
    'Enabled': 'Ativado',
    'Disabled': 'Desativado',
    'Please try again': 'Tente novamente',
    'An error occurred': 'Ocorreu um erro',
    'Details': 'Detalhes',
    'Status': 'Estado',
    'Connection': 'Conexão',
    'Network': 'Rede',
    'Page': 'Página',
    'Last attempt': 'Última tentativa',
    'Copy': 'Copiar',
    'Copied': 'Copiado',
    'Copy report': 'Copiar relatório',
    'Please wait…': 'Aguarde…',
    'This may take a moment': 'Isto pode demorar um pouco',
    'The report is ready': 'O relatório está pronto',
    'Sending report…': 'Enviando relatório…',
    'Report sent': 'Relatório enviado',
    'Report failed': 'Falha no relatório',
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

import { api } from '@converse/headless';
import { __ } from 'i18n';

/** @type {Array<(code?: string, details?: {from?: string, iq?: Element}) => string[] | undefined>} */
const message_makers = [];

/**
 * Registers a function that returns the text for the error codes it knows. It
 * returns undefined for any other code, so that the next one can be asked.
 * @param {(code?: string, details?: {from?: string, iq?: Element}) => string[] | undefined} makeMessages
 */
export function addSendErrorMessages(makeMessages) {
    message_makers.push(makeMessages);
}

/**
 * Returns the text that explains a failed send.
 * @param {string} [code] - The `code` of the error that failed the send.
 * @param {Object} [details]
 * @param {string} [details.from] - The JID that the reason names, when the failure came from the server.
 * @param {Element} [details.iq] - The IQ that failed, when the failure came from the server.
 * @returns {string[]}
 */
export function getSendErrorMessages(code, details = {}) {
    for (const makeMessages of message_makers) {
        const messages = makeMessages(code, details);
        if (messages) return messages;
    }
    if (code === 'not-connected') {
        return [__('Your message could not be sent because you are not connected.')];
    }
    return [__('Your message could not be sent.')];
}

/**
 * Shows a failed send to the user. Call it once per failed send.
 *
 * A send that failed because the connection dropped is shown as a non-blocking
 * toast, since the failed message already stays in the conversation with the
 * reason and the retry and discard buttons. Other failures still use an alert.
 * @param {Error & {code?: string, iq?: Element}} e
 */
export function alertSendError(e) {
    const messages = getSendErrorMessages(e.code, { from: e.iq?.getAttribute('from'), iq: e.iq });
    api.trigger('diagnosticEvent', {
        'event': 'send_error_shown',
        'code': e.code ?? 'send-failed',
        'kind': e.code === 'not-connected' ? 'toast' : 'modal',
    });

    if (e.code === 'not-connected') {
        api.toast?.show?.('send-failed-not-connected', {
            'type': 'warning', // A `danger` toast doesn't auto-hide, a warning hides after 5s.
            'title': __('Not connected'),
            'body': messages.join(' '),
        });
        return;
    }
    api.alert('error', __('Error'), messages);
}

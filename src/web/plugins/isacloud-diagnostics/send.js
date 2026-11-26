/**
 * @description
 *  isaCloud: sending the diagnostics report. The file only leaves the browser
 *  through an encrypted (OMEMO) message to the report address; when that is
 *  not possible it is never sent in the clear. There is no silent fallback:
 *  every guard that fails throws a short code that the modal explains, and
 *  the download stays available.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, constants, u } from '@converse/headless';
import { createReportFile, downloadReport } from './report.js';
import { ready, record } from './recorder.js';
import { t } from './i18n.js';

/** How long an upload may take before the send is abandoned. */
const UPLOAD_TIMEOUT = 30000;

/** How long to wait for OMEMO to say whether the chat supports encryption. */
const OMEMO_TIMEOUT = 10000;

/**
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function makeError(code) {
    return Object.assign(new Error(code), { code });
}

/**
 * Waits for the placeholder message's upload to finish. The listener is
 * attached immediately, and the current state is checked too, since the slot
 * request that `sendFiles` starts may already have finished.
 * @param {any} message
 * @returns {Promise<void>}
 */
function waitForUpload(message) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(makeError('timeout'));
        }, UPLOAD_TIMEOUT);

        const cleanup = () => {
            clearTimeout(timeout);
            message.off('change:upload', on_change);
        };

        const on_change = () => {
            const upload = message.get('upload');
            if (upload === constants.SUCCESS) {
                cleanup();
                resolve();
            } else if (upload === constants.FAILURE) {
                cleanup();
                reject(makeError('upload-failed'));
            }
        };

        message.on('change:upload', on_change);
        on_change();
    });
}

/**
 * Sends the diagnostics report as an OMEMO-encrypted file to the configured
 * report address. `recipient` overrides it only for local tests.
 * @param {{ note?: string, recipient?: string }} [options]
 * @returns {Promise<{ ok: true }>}
 */
export async function sendReport({ note, recipient } = {}) {
    if (!api.connection.authenticated()) throw makeError('not-connected');

    await ready;
    const file = await createReportFile(note);

    const jid = String(recipient || api.settings.get('isacloud_diagnostics_report_jid')).trim();
    if (!jid.includes('@')) throw makeError('invalid-recipient');
    const chat = await api.chats.get(jid, {}, true);
    if (!chat) throw makeError('no-report-chat');

    try {
        await u.waitUntil(() => chat.get('omemo_supported') !== undefined, OMEMO_TIMEOUT);
    } catch {
        throw makeError('omemo-unsupported');
    }
    if (!chat.get('omemo_supported')) throw makeError('omemo-unsupported');

    chat.save({ omemo_active: true });

    record('report_send_started');

    let messages;
    try {
        messages = await chat.sendFiles([file]);
    } catch {
        record('report_send_failed', { code: 'upload-failed' });
        throw makeError('upload-failed');
    }

    if (!messages?.length) {
        record('report_send_failed', { code: 'upload-unavailable' });
        throw makeError('upload-unavailable');
    }

    const [message] = messages;
    if (message.get('upload') === constants.FAILURE) {
        record('report_send_failed', { code: 'upload-failed' });
        throw makeError('upload-failed');
    }

    try {
        if (message.get('upload') !== constants.SUCCESS) await waitForUpload(message);
    } catch (e) {
        record('report_send_failed', { code: /** @type {{code?: string}} */ (e)?.code });
        throw e;
    }

    record('report_send_success');
    api.toast.show('isacloud-diagnostics-report-sent', {
        type: 'success',
        body: t('The report was sent'),
    });
    return { ok: true };
}

/**
 * Downloads the report as a file. Always available, even without a session.
 * @param {string} [note]
 * @returns {Promise<void>}
 */
export async function downloadReportFile(note) {
    await ready;
    await downloadReport(note);
    record('report_download');
}

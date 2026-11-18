/**
 * @description
 *  isaCloud: the diagnostics dialog. It can be opened from Settings → About and
 *  from the footer of the login screen, so it must work without a session. The
 *  download is always available; sending is only enabled when the connection is
 *  authenticated, and only ever happens through an OMEMO-encrypted message.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import BaseModal from 'plugins/modal/modal.js';
import { getSummary, ready } from './recorder.js';
import { downloadReportFile, sendReport } from './send.js';
import { showTestTools } from './force-failure.js';
import { t } from './i18n.js';

/**
 * @param {{ disconnects?: number, reconnects?: number }} summary
 * @returns {string}
 */
function summaryText(summary) {
    return t('Last 24 h: %1$s disconnects, %2$s reconnects')
        .replace('%1$s', String(summary.disconnects ?? 0))
        .replace('%2$s', String(summary.reconnects ?? 0));
}

/** @type {Record<string, string>} */
const ERROR_TEXT = {
    'not-connected': 'Not connected. Download the file and send it when the connection is back.',
    'invalid-recipient': 'Enter a valid XMPP address for the test.',
    'omemo-unsupported': 'OMEMO is not available for this report. Download the file instead.',
    'no-report-chat': 'The report could not be sent. Download the file instead.',
    'upload-unavailable': 'The upload service is not available. Download the file instead.',
    'upload-failed': 'The report could not be sent. Download the file instead.',
    timeout: 'The report could not be sent. Download the file instead.',
};

export default class DiagnosticsModal extends BaseModal {
    static get properties() {
        return {
            ...super.properties,
            authenticated: { type: Boolean },
            busy: { type: Boolean },
            note: { type: String },
            test_recipient: { type: String },
            status: { type: String },
            status_type: { type: String },
            summary: { type: Object },
        };
    }

    #onConnectionChange = () => {
        this.authenticated = !!api.connection.authenticated();
        this.requestUpdate();
    };

    constructor() {
        super();
        this.authenticated = false;
        this.busy = false;
        this.note = '';
        this.test_recipient = api.settings.get('isacloud_diagnostics_report_jid') ?? '';
        this.status = '';
        this.status_type = 'info';
        this.summary = null;
    }

    async initialize() {
        super.initialize();
        this.classList.add('isacloud-diagnostics-modal');
        this.#onConnectionChange();

        api.listen.on('connected', this.#onConnectionChange);
        api.listen.on('reconnected', this.#onConnectionChange);
        api.listen.on('disconnected', this.#onConnectionChange);
        api.listen.on('will-reconnect', this.#onConnectionChange);
        api.listen.on('connfeedback', this.#onConnectionChange);

        await ready;
        this.summary = getSummary();
        this.requestUpdate();
    }

    disconnectedCallback() {
        api.listen.not('connected', this.#onConnectionChange);
        api.listen.not('reconnected', this.#onConnectionChange);
        api.listen.not('disconnected', this.#onConnectionChange);
        api.listen.not('will-reconnect', this.#onConnectionChange);
        api.listen.not('connfeedback', this.#onConnectionChange);
        super.disconnectedCallback();
    }

    getModalTitle() {
        return t('Connection diagnostics');
    }

    /**
     * @returns {string}
     */
    connectionStateText() {
        if (api.connection.authenticated() && api.connection.connected()) return t('Connected');
        if (api.connection.connected()) return t('Connecting…');
        return t('Not connected');
    }

    /**
     * @param {string} [code]
     * @returns {string}
     */
    errorText(code) {
        const english = code && ERROR_TEXT[code];
        return t(english || 'Could not send the report');
    }

    /**
     * @param {InputEvent} ev
     */
    onNoteInput(ev) {
        this.note = /** @type {HTMLTextAreaElement} */ (ev.target).value;
    }

    /**
     * @param {InputEvent} ev
     */
    onRecipientInput(ev) {
        this.test_recipient = /** @type {HTMLInputElement} */ (ev.target).value;
    }

    /**
     * @param {Event} [ev]
     */
    async onSend(ev) {
        ev?.preventDefault();
        if (this.busy) return;

        this.busy = true;
        this.status_type = 'info';
        this.status = t('Sending…');
        try {
            await sendReport({
                note: this.note,
                recipient: showTestTools() ? this.test_recipient : undefined,
            });
            this.status_type = 'success';
            this.status = t('Sent');
            setTimeout(() => {
                if (this.isConnected) this.close();
            }, 1500);
        } catch (e) {
            this.status_type = 'error';
            this.status = this.errorText(e?.code);
            api.toast.show('isacloud-diagnostics-send-failed', {
                type: 'danger',
                body: this.status,
            });
        } finally {
            this.busy = false;
        }
    }

    /**
     * @param {Event} [ev]
     */
    async onDownload(ev) {
        ev?.preventDefault();
        if (this.busy) return;

        this.busy = true;
        this.status_type = 'info';
        this.status = t('Please wait…');
        try {
            await downloadReportFile(this.note);
            this.status_type = 'success';
            this.status = t('The report is ready');
        } catch {
            this.status_type = 'error';
            this.status = t('Could not download the report');
        } finally {
            this.busy = false;
        }
    }

    renderModal() {
        return html`<div class="isacloud-diagnostics-modal__content">
            <p class="isacloud-diagnostics-modal__text">
                ${t(
                    'The report includes times of disconnections, connection type, browser version and technical errors. It does not include the content of your messages.',
                )}
            </p>
            ${this.summary ? html`<p class="isacloud-diagnostics-modal__summary">${summaryText(this.summary)}</p>` : ''}
            <p class="isacloud-diagnostics-modal__state">${t('Now')}: ${this.connectionStateText()}</p>
            <p class="isacloud-diagnostics-modal__target">${t('Reports go to reports@isacloud.im')}</p>
            ${
                this.authenticated
                    ? ''
                    : html`<p class="isacloud-diagnostics-modal__no-connection">
                          ${t('Not connected. Download the file and send it when the connection is back.')}
                      </p>`
            }
            ${
                showTestTools()
                    ? html`<label class="form-label" for="isacloud-diagnostics-test-recipient"
                              >${t('Test recipient')}</label
                          >
                          <input
                              id="isacloud-diagnostics-test-recipient"
                              class="form-control isacloud-diagnostics-modal__recipient"
                              type="text"
                              .value=${this.test_recipient ?? ''}
                              @input=${this.onRecipientInput}
                          />
                          <p class="isacloud-diagnostics-modal__hint">${t('Normally reports@isacloud.im')}</p>`
                    : ''
            }
            <label class="form-label" for="isacloud-diagnostics-note">${t('What happened? (optional)')}</label>
            <textarea
                id="isacloud-diagnostics-note"
                class="form-control isacloud-diagnostics-modal__note"
                maxlength="500"
                .value=${this.note ?? ''}
                @input=${this.onNoteInput}
            ></textarea>
            <p
                class="isacloud-diagnostics-modal__status isacloud-diagnostics-modal__status--${this.status_type}"
                role="status"
                aria-live="polite"
            >
                ${this.status ?? ''}
            </p>
        </div>`;
    }

    renderModalFooter() {
        return html`<div class="modal-footer isacloud-diagnostics-modal__footer">
            <button
                type="button"
                class="btn btn-secondary isacloud-diagnostics-modal__download"
                ?disabled=${this.busy}
                @click=${this.onDownload}
            >
                ${t('Download')}
            </button>
            <button
                type="button"
                class="btn btn-primary isacloud-diagnostics-modal__send"
                ?disabled=${this.busy || !this.authenticated}
                @click=${this.onSend}
            >
                ${t('Send')}
            </button>
        </div>`;
    }
}

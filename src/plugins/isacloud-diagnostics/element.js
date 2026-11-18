/**
 * @description
 *  isaCloud: the diagnostics section of Settings → About. It shows how many
 *  disconnects were recorded in the last 24 hours and opens the modal that
 *  prepares, downloads and sends the report. It renders nothing when the
 *  diagnostics are off, so other installations are unchanged.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { getSummary, ready } from './recorder.js';
import { forceConnectionFailure, showTestTools } from './force-failure.js';
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

export default class DiagnosticsSection extends CustomElement {
    constructor() {
        super();
        /** @type {ReturnType<typeof getSummary>|null} */
        this.summary = null;
    }

    async initialize() {
        if (!api.settings.get('isacloud_diagnostics')) return;
        await ready;
        this.summary = getSummary();
        this.requestUpdate();
    }

    render() {
        if (!api.settings.get('isacloud_diagnostics')) return '';

        return html`<section class="isacloud-diagnostics" aria-labelledby="isacloud-diagnostics-title">
            <h3 class="isacloud-diagnostics__title" id="isacloud-diagnostics-title">${t('Connection diagnostics')}</h3>
            <p class="isacloud-diagnostics__text">
                ${t(
                    'The report includes times of disconnections, connection type, browser version and technical errors. It does not include the content of your messages.',
                )}
            </p>
            ${this.summary ? html`<p class="isacloud-diagnostics__summary">${summaryText(this.summary)}</p>` : ''}
            <div class="isacloud-diagnostics__actions">
                <button
                    type="button"
                    class="btn btn-primary isacloud-diagnostics__open"
                    @click=${() => {
                        // The report has its own dialog; don't leave this one behind it.
                        /** @type {any} */ (this.closest('converse-user-settings-modal'))?.close();
                        api.modal.show('converse-isacloud-diagnostics-modal');
                    }}
                >
                    ${t('Send diagnostics')}
                </button>
                ${
                    showTestTools()
                        ? html`<button
                              type="button"
                              class="isacloud-diagnostics__test"
                              title="${t('Test diagnostics (drops the connection)')}"
                              @click=${() => forceConnectionFailure()}
                          >
                              ${t('Test diagnostics (drops the connection)')}
                          </button>`
                        : ''
                }
            </div>
        </section>`;
    }
}

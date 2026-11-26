import { html } from 'lit/html.js';
import { __ } from 'i18n';
import tplSpinner from 'templates/spinner.js';

/**
 * @param {import('../placeholder').default} el
 */
export default (el) => {
    if (el.model.get('fetching')) {
        return tplSpinner({ class: 'hor_centered' });
    }
    if (el.isAutoFillPaused()) {
        return html`<div class="mam-placeholder__more">
            <button type="button" class="btn btn-sm btn-secondary" @click="${(ev) => el.fetchMissingMessages(ev)}">
                ${__('Load earlier messages')}
            </button>
        </div>`;
    }
    return html`<a @click="${(ev) => el.fetchMissingMessages(ev)}" title="${__('Click to load missing messages')}">
        <div class="message mam-placeholder"></div>
    </a>`;
};

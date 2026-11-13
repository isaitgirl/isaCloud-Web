/**
 * @description
 *  isaCloud: the "new version" button shown next to the settings gear.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { reloadWithNewVersion, update_state, UPDATE_EVENT } from './update.js';
import { t } from './i18n.js';

export default class UpdateButton extends CustomElement {
    #onUpdate = () => this.requestUpdate();

    connectedCallback() {
        super.connectedCallback();
        update_state.addEventListener(UPDATE_EVENT, this.#onUpdate);
    }

    disconnectedCallback() {
        update_state.removeEventListener(UPDATE_EVENT, this.#onUpdate);
        super.disconnectedCallback();
    }

    render() {
        if (!update_state.available) return '';
        const label = t('New version available, click to update');
        return html`<a
            href="#"
            class="isacloud-update-btn"
            role="button"
            title="${label}"
            aria-label="${label}"
            @click=${(/** @type {MouseEvent} */ ev) => {
                ev.preventDefault();
                reloadWithNewVersion();
            }}
        >
            <converse-icon class="fa fa-sync" size="1em"></converse-icon>
        </a>`;
    }
}

api.elements.define('converse-isacloud-update-button', UpdateButton);

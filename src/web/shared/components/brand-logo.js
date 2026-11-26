import { api } from '@converse/headless';
import { CustomElement } from './element.js';
import { html } from 'lit';
import 'shared/components/logo.js';

export class ConverseBrandLogo extends CustomElement {
    static get properties() {
        return {
            hide_byline: { type: Boolean },
        };
    }

    constructor() {
        super();
        this.hide_byline = false;
    }

    render() {
        const is_fullscreen = api.settings.get('view_mode') === 'fullscreen';
        const href = api.settings.get('brand_logo_link');
        const brand_name = api.settings.get('brand_name') || 'isaCloud';
        const logo = html`
            <span class="brand-name-wrapper ${is_fullscreen ? 'brand-name-wrapper--fullscreen' : ''}">
                <converse-logo class="converse-svg-logo"></converse-logo>
            </span>
        `;
        return href
            ? html`<a class="brand-heading" href="${href}" target="_blank" rel="noopener" aria-label="${brand_name}"
                  >${logo}</a
              >`
            : html`<span class="brand-heading" aria-label="${brand_name}">${logo}</span>`;
    }
}

api.elements.define('converse-brand-logo', ConverseBrandLogo);

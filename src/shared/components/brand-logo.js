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
        return html`
            <a class="brand-heading" href="https://isacloud.com.br" target="_blank" rel="noopener">
                <span class="brand-name-wrapper ${is_fullscreen ? 'brand-name-wrapper--fullscreen' : ''}">
                    <converse-logo class="converse-svg-logo"></converse-logo>
                </span>
            </a>
        `;
    }
}

api.elements.define('converse-brand-logo', ConverseBrandLogo);

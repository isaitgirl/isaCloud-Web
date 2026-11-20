import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';

class ConverseLogo extends CustomElement {
    render() {
        const brand_name = api.settings.get('brand_name') || 'isaCloud';
        const brand_logo_url = api.settings.get('brand_logo_url');
        if (brand_logo_url) {
            return html`<img class="converse-logo__img" src="${brand_logo_url}" alt="${brand_name}" />`;
        }
        return html`<svg
            class="converse-svg-logo"
            viewBox="0 0 320 302"
            role="img"
            aria-label="${brand_name}"
            xmlns="http://www.w3.org/2000/svg"
        >
            <image href="${api.settings.get('assets_path')}/images/isacloud/balao-im.png" width="320" height="302" />
        </svg>`;
    }
}

api.elements.define('converse-logo', ConverseLogo);

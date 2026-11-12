import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';

class ConverseLogo extends CustomElement {
    render() {
        return html`<svg
            class="converse-svg-logo"
            viewBox="0 0 320 302"
            role="img"
            aria-label="isaCloud"
            xmlns="http://www.w3.org/2000/svg"
        >
            <image href="${api.settings.get('assets_path')}/images/isacloud/balao-im.png" width="320" height="302" />
        </svg>`;
    }
}

api.elements.define('converse-logo', ConverseLogo);

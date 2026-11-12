import { _converse, api } from '@converse/headless';
import { html } from 'lit';
import { CustomElement } from './element.js';

export class ConverseFooter extends CustomElement {
    render() {
        const is_fullscreen = api.settings.get('view_mode') === 'fullscreen';
        if (!is_fullscreen) return '';
        return html`
            <footer class="footer mt-auto py-3 pb-3">
                <div class="container">
                    <div class="row">
                        <div class="col-12 text-center">
                            <a
                                class="isacloud-footer-brand"
                                href="https://isacloud.com.br"
                                target="_blank"
                                rel="noopener"
                            >
                                <img
                                    class="isacloud-footer-wordmark"
                                    src="${api.settings.get('assets_path')}/images/isacloud/logo-isacloud-im.png"
                                    alt="isaCloud"
                                />
                                <span class="isacloud-footer-byline">comunidade brasileira de XMPP</span>
                            </a>
                            <p class="brand-subtitle mb-2 subdued">Versão: ${_converse.VERSION_NAME}</p>
                            <p class="brand-subtitle mb-2">
                                Feito com
                                <a target="_blank" rel="noopener" href="https://conversejs.org">Converse</a>
                                (<a target="_blank" rel="noopener" href="https://github.com/isaitgirl/isaCloud-Web"
                                    >código-fonte</a
                                >).
                            </p>
                            <p class="brand-subtitle mb-3">
                                Gostou? Apoie o isaCloud no
                                <a href="https://liberapay.com/isacloud" target="_blank" rel="noopener">Liberapay</a>.
                                💜
                            </p>
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }
}

api.elements.define('converse-footer', ConverseFooter);

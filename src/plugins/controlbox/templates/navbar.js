import { html } from 'lit';

/**
 * @param {import('../navbar.js').default} el
 */
export default (el) => {
    return html`
        <nav class="navbar navbar-expand-lg">
            <div class="container-fluid">
                <div class="collapse navbar-collapse">
                    <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
                        <li class="nav-item">
                            <a class="nav-link" target="_blank" rel="noopener" href="https://isacloud.com.br"
                                >isaCloud</a
                            >
                        </li>
                        <li class="nav-item">
                            <a
                                class="nav-link"
                                target="_blank"
                                rel="noopener"
                                href="https://github.com/isaitgirl/isaCloud-Web"
                                >Código-fonte</a
                            >
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" target="_blank" rel="noopener" href="https://isacloud.com.br/#doacoes"
                                >Apoie</a
                            >
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click=${el.openAboutDialog}>Sobre</a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    `;
};

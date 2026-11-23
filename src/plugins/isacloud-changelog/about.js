/**
 * @description
 *  isaCloud: the changelog entry in Settings → About. It opens the same view as
 *  the conversation row and links to the full changelog on GitHub in a new
 *  window. It never archives; the only archive control is the row itself.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { t } from './i18n.js';
import { changelog_state, openChangelog } from './state.js';

export default class ChangelogAboutLink extends CustomElement {
    render() {
        if (!api.settings.get('isacloud_changelog') || !changelog_state.enabled) return '';

        const url = api.settings.get('isacloud_changelog_github_url');
        return html`<section class="isacloud-changelog-link" aria-labelledby="isacloud-changelog-link-title">
            <h3 class="isacloud-changelog-link__title" id="isacloud-changelog-link-title">
                ${t('What’s new in isaCloud Web')}
            </h3>
            <p class="isacloud-changelog-link__text">${t('See what changed in the latest versions.')}</p>
            <div class="isacloud-changelog-link__actions">
                <button
                    type="button"
                    class="btn btn-primary isacloud-changelog-link__open"
                    @click=${(/** @type {Event} */ ev) => {
                        ev.preventDefault();
                        // Don't leave the settings modal behind the conversation view.
                        /** @type {any} */ (this.closest('converse-user-settings-modal'))?.close();
                        openChangelog();
                    }}
                >
                    ${t('View what’s new in isaCloud Web')}
                </button>
            </div>
            ${
                url
                    ? html`<p class="isacloud-changelog-link__github">
                          <a href="${url}" target="_blank" rel="noopener noreferrer"
                              >${t('Open full changelog on GitHub')}</a
                          >
                      </p>`
                    : ''
            }
        </section>`;
    }
}

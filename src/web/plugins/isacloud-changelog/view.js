/**
 * @description
 *  isaCloud: the "What's new" view, a pseudo-conversation inside the Chat app.
 *  It shows the releases selected by the state module, newest first, and is
 *  not a ChatBox: the plugin appends the element to `converse-app-chat`, and
 *  the state decides whether it is open. On desktop it is a card placed by the
 *  theme over the conversation area; below 768px it covers the whole screen.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { CHANGELOG_EVENT, changelog_state, closeChangelog, isArchived, unarchiveChangelog } from './state.js';
import { t } from './i18n.js';

/**
 * The heading of a release. With no date, the trailing separator goes too.
 * @param {import('./batch.js').ChangelogRelease} release
 * @returns {string}
 */
function releaseHeading(release) {
    const date = release.date || '';
    const text = t('Version %1$s • %2$s', release.version, date);
    return date ? text : text.replace(/\s*•\s*$/, '');
}

/**
 * The isaCloud changelog, laid out as a conversation with the isaCloud
 * balloon: a header with a back button and the current version, and a
 * scrollable list of releases.
 * @extends {CustomElement}
 */
export default class ChangelogView extends CustomElement {
    #was_open = false;

    /** @type {HTMLElement[]} */
    #inert_siblings = [];

    #onChange = () => this.requestUpdate();

    constructor() {
        super();
        // Start hidden so the empty host never paints over the conversation
        // area between the app's render and the first `updated()`.
        this.hidden = true;
    }

    connectedCallback() {
        super.connectedCallback();
        changelog_state.addEventListener(CHANGELOG_EVENT, this.#onChange);
    }

    disconnectedCallback() {
        changelog_state.removeEventListener(CHANGELOG_EVENT, this.#onChange);
        this.#setSiblingsInert(false);
        // A reconnect re-applies the inert state if the view is still open.
        this.#was_open = false;
        super.disconnectedCallback();
    }

    /**
     * Hides the host while closed and, when the view opens or closes, moves
     * focus and takes the rest of the app out of the tab order.
     */
    updated() {
        const is_open = changelog_state.open;
        this.hidden = !is_open;

        if (is_open === this.#was_open) return;
        this.#was_open = is_open;
        this.#setSiblingsInert(is_open);

        if (is_open) {
            /** @type {HTMLElement|null} */ (this.querySelector('.isacloud-changelog__back'))?.focus();
        } else {
            /** @type {HTMLElement|null} */ (
                this.ownerDocument.querySelector('.recent-item--changelog .recent-item__link')
            )?.focus();
        }
    }

    /**
     * While the view is open, the sidebar and the conversations behind it stay
     * visible but cannot be reached with the keyboard or a click.
     * @param {boolean} disabled
     */
    #setSiblingsInert(disabled) {
        if (disabled) {
            this.#inert_siblings = [];
            const parent = this.parentElement;
            if (!parent) return;
            // On desktop the sidebar stays usable: the view covers only the
            // conversation area, and clicking another conversation closes it
            // through `openConversation`. On a phone it would be behind the
            // full-screen view, so it goes inert too.
            const is_mobile = window.matchMedia('(max-width: 767.98px)').matches;
            for (const sibling of parent.children) {
                if (sibling === this || !(sibling instanceof HTMLElement)) continue;
                if (!is_mobile && sibling.id === 'controlbox') continue;
                this.#inert_siblings.push(sibling);
                sibling.inert = true;
            }
        } else {
            for (const sibling of this.#inert_siblings) sibling.inert = false;
            this.#inert_siblings = [];
        }
    }

    render() {
        if (!changelog_state.open) return '';

        const { current_version, releases } = changelog_state;
        const archived = isArchived();
        const github_url = api.settings.get('isacloud_changelog_github_url');
        const avatar_src = `${api.settings.get('assets_path')}/images/isacloud/balao-im.png`;
        const title_id = 'isacloud-changelog-title';

        return html`
            <section class="isacloud-changelog" role="region" aria-labelledby="${title_id}">
                <header class="isacloud-changelog__header">
                    <button
                        type="button"
                        class="chatbox-btn isacloud-changelog__back"
                        title="${t('Back to conversations')}"
                        aria-label="${t('Back to conversations')}"
                        @click=${() => closeChangelog()}
                    >
                        <converse-icon class="fa fa-arrow-left" size="1em" aria-hidden="true"></converse-icon>
                    </button>
                    <img class="isacloud-changelog__avatar" src="${avatar_src}" alt="" width="44" height="44" />
                    <div class="isacloud-changelog__heading">
                        <h2 class="isacloud-changelog__title" id="${title_id}">${t('What’s new in isaCloud')}</h2>
                        <p class="isacloud-changelog__subtitle">${current_version}</p>
                    </div>
                </header>
                <div class="isacloud-changelog__body">
                    ${
                        releases.length
                            ? releases.map(
                                  (release) =>
                                      html`<section class="isacloud-changelog__release">
                                          <h3 class="isacloud-changelog__release-title">${releaseHeading(release)}</h3>
                                          ${
                                              release.items?.length
                                                  ? html`<ul class="isacloud-changelog__items">
                                                        ${release.items.map(
                                                            (item) =>
                                                                html`<li class="isacloud-changelog__item">
                                                                    ${
                                                                        item.title
                                                                            ? html`<strong>${item.title}:</strong>
                                                                                  ${item.text}`
                                                                            : item.text
                                                                    }
                                                                </li>`,
                                                        )}
                                                    </ul>`
                                                  : ''
                                          }
                                      </section>`,
                              )
                            : html`<p class="isacloud-changelog__empty">${t('No news for now.')}</p>`
                    }
                    <div class="isacloud-changelog__footer">
                        ${
                            archived
                                ? html`<button
                                      type="button"
                                      class="isacloud-changelog__unarchive"
                                      @click=${() => unarchiveChangelog()}
                                  >
                                      ${t('Show in conversation list')}
                                  </button>`
                                : ''
                        }
                        ${
                            github_url
                                ? html`<a
                                      class="isacloud-changelog__github"
                                      href="${github_url}"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      >${t('Open full changelog on GitHub')}</a
                                  >`
                                : ''
                        }
                    </div>
                </div>
            </section>
        `;
    }
}

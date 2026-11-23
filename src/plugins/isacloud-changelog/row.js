/**
 * @description
 *  isaCloud: the "Novidades do isaCloud" row at the top of the conversation
 *  list. It behaves like a conversation (opens a view) but has its own archive
 *  button and never enters the chatboxes collection.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html, nothing } from 'lit';
import { api } from '@converse/headless';
import { t } from './i18n.js';
import { formatVersionLabel } from './batch.js';
import { archiveChangelog, getChangelogItem, openChangelog } from './state.js';

/**
 * The row only belongs to the recent conversations view, on the "All" filter.
 * @param {{model?: {get: (key: string) => unknown}}} el
 * @returns {boolean}
 */
export function hasChangelogItem(el) {
    if (el?.model?.get('view') !== 'recent' || el?.model?.get('filter') !== 'all') return false;
    return !!getChangelogItem();
}

/**
 * @param {{model?: {get: (key: string) => unknown}}} el
 * @returns {import('lit').TemplateResult|typeof nothing}
 */
export function tplChangelogRow(el) {
    if (!hasChangelogItem(el)) return nothing;

    const item = getChangelogItem();
    if (!item) return nothing;

    const preview =
        item.releases.length === 1
            ? t('See what changed in version %1$s', item.releases[0].version)
            : t('See what changed in versions %1$s', formatVersionLabel(item.releases));
    const title = t('Click to open the isaCloud news');
    const archive_label = t('Archive news');

    return html`<li class="recent-item recent-item--changelog ${item.unread ? 'unread' : ''}" data-changelog>
        <a
            href="#"
            class="recent-item__link"
            title="${title}"
            aria-label="${t('What’s new in isaCloud')}. ${preview}"
            @click=${(/** @type {Event} */ ev) => {
                ev.preventDefault();
                openChangelog();
            }}
        >
            <span class="recent-item__avatar">
                <img
                    class="avatar"
                    src="${api.settings.get('assets_path')}/images/isacloud/balao-im.png"
                    alt=""
                    width="44"
                    height="44"
                />
            </span>
            <span class="recent-item__body">
                <span class="recent-item__name-row">
                    <span class="recent-item__name">${t('What’s new in isaCloud')}</span>
                    ${item.unread ? html`<span class="recent-item__new">${t('New')}</span>` : nothing}
                </span>
                <span class="recent-item__preview">${preview}</span>
            </span>
            <span class="recent-item__meta">
                <time class="recent-item__time">${item.date}</time>
            </span>
        </a>
        <button
            type="button"
            class="recent-item__archive"
            title="${archive_label}"
            aria-label="${archive_label}"
            @click=${(/** @type {Event} */ ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                archiveChangelog();
                api.toast.show('isacloud-changelog-archived', {
                    type: 'info',
                    body: t('News archived. You can reopen it in Settings → About.'),
                });
            }}
        >
            <converse-icon class="fa fa-box-archive" size="0.9em"></converse-icon>
        </button>
    </li>`;
}

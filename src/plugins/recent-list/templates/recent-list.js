/**
 * @typedef {import('../view').RecentList} RecentList
 */
import { html } from 'lit';
import { __ } from 'i18n';
import '../styles/recent-list.scss';
import tplRecentRow from './row.js';

/** @param {RecentList} el */
function tplHeader(el) {
    if (el.model.get('view') === 'contacts') {
        return html`<div class="recent-list__header">
            <button
                type="button"
                class="recent-list__icon-btn recent-list__icon-btn--neutral recent-list__back"
                title="${__('Back to conversations')}"
                aria-label="${__('Back to conversations')}"
                @click=${() => el.showRecent()}
            >
                <converse-icon class="fa fa-arrow-left" size="1em" aria-hidden="true"></converse-icon>
            </button>
            <h2 class="recent-list__title">${__('Contacts')}</h2>
        </div>`;
    }
    return html`<div class="recent-list__header">
        <h2 class="recent-list__title">${__('Conversations')}</h2>
        <button
            type="button"
            class="recent-list__icon-btn recent-list__contacts-btn"
            title="${__('Contacts')}"
            aria-label="${__('Contacts')}"
            @click=${() => el.showContacts()}
        >
            <converse-icon class="fa fa-address-book" size="1em" color="#fff" aria-hidden="true"></converse-icon>
        </button>
    </div>`;
}

/** @param {RecentList} el */
function tplFilters(el) {
    const active = el.model.get('filter');
    const filters = [
        ['unread', __('Unread chats')],
        ['contacts', __('Contacts')],
        ['groups', __('Groups')],
        ['channels', __('Channels')],
    ];
    // "All" is an icon, so the chips fit on one line: a list while nothing is
    // filtered, a cross that clears the filter otherwise.
    const is_all = active === 'all';
    const all_label = is_all ? __('All') : __('Clear filters');
    return html`<div class="recent-list__filters" role="group" aria-label="${__('Conversations')}">
        <button
            type="button"
            class="recent-list__chip recent-list__chip--all ${is_all ? 'active' : ''}"
            aria-pressed="${is_all ? 'true' : 'false'}"
            title="${all_label}"
            aria-label="${all_label}"
            @click=${() => el.setFilter('all')}
        >
            <converse-icon
                class="fa ${is_all ? 'fa-list-ul' : 'fa-times'}"
                size="0.85em"
                color="currentColor"
                aria-hidden="true"
            ></converse-icon>
        </button>
        ${filters.map(
            ([id, label]) =>
                html`<button
                    type="button"
                    class="recent-list__chip ${active === id ? 'active' : ''}"
                    aria-pressed="${active === id ? 'true' : 'false'}"
                    @click=${() => el.setFilter(id)}
                >
                    ${label}
                </button>`,
        )}
    </div>`;
}

/** @param {RecentList} el */
function tplEmpty(el) {
    return html`<div class="recent-list__empty">
        <p class="recent-list__empty-text">${__('No conversations yet')}</p>
        <button type="button" class="btn btn-primary btn-sm" @click=${() => el.showContacts()}>
            ${__('Contacts')}
        </button>
    </div>`;
}

/** @param {RecentList} el */
function tplRecentBody(el) {
    const items = el.getItems();
    return html`${tplFilters(el)}
        <div class="recent-list__body">
            ${
                items.length
                    ? html`<ul class="recent-list__items">
                          ${items.map((item) => tplRecentRow(el, item))}
                      </ul>`
                    : tplEmpty(el)
            }
        </div>`;
}

/**
 * The sidebar: the conversation list, or the original contacts lists
 * (rooms and roster) when the contacts view is open.
 * @param {RecentList} el
 */
export default (el) => {
    const is_contacts = el.model.get('view') === 'contacts';
    return html`<div class="recent-list ${is_contacts ? 'recent-list--contacts' : ''}">
        ${tplHeader(el)}
        ${
            is_contacts
                ? html`<div class="recent-list__body recent-list__body--contacts">${el.renderContacts?.()}</div>`
                : tplRecentBody(el)
        }
    </div>`;
};

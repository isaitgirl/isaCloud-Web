/**
 * @typedef {import('shared/components/list-filter').default} ListFilter
 */
import { html } from 'lit';
import { __ } from 'i18n';

/**
 * @param {ListFilter} el
 */
export default (el) => {
    const i18n_placeholder = __('Filter');
    const title_contact_filter = __('Filter by contact name');
    const title_group_filter = __('Filter by group name');

    const filter_text = el.model.get('text');
    const filter_type = el.model.get('type');

    return html` <form
        class="controlbox-padded items-filter-form input-button-group ${!el.shouldBeVisible() ? 'hidden' : 'fade-in'}"
        @submit=${(/** @type {Event} */ ev) => el.submitFilter(ev)}
    >
        <div class="d-flex flex-nowrap align-items-center">
            <div class="filter-by d-flex flex-nowrap">
                <converse-icon
                    size="1em"
                    @click=${(/** @type {Event} */ ev) => el.changeTypeFilter(ev)}
                    class="fa fa-user clickable ${filter_type === 'items' ? 'selected' : ''}"
                    data-type="items"
                    title="${title_contact_filter}"
                ></converse-icon>
                <converse-icon
                    size="1em"
                    @click=${(/** @type {Event} */ ev) => el.changeTypeFilter(ev)}
                    class="fa fa-users clickable ${filter_type === 'groups' ? 'selected' : ''}"
                    data-type="groups"
                    title="${title_group_filter}"
                ></converse-icon>
            </div>
            <div class="btn-group">
                <input
                    .value="${filter_text || ''}"
                    @keydown=${(/** @type {Event} */ ev) => el.liveFilter(ev)}
                    class="items-filter form-control"
                    placeholder="${i18n_placeholder}"
                />
                <converse-icon
                    size="1em"
                    class="fa fa-times clear-input ${!filter_text ? 'hidden' : ''}"
                    @click=${(/** @type {Event} */ ev) => el.clearFilter(ev)}
                >
                </converse-icon>
            </div>
        </div>
    </form>`;
};

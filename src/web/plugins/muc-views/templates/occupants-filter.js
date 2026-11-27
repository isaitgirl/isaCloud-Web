import { html } from 'lit';
import { __ } from 'i18n';
import { api } from '@converse/headless';

/**
 * @param {import('shared/components/list-filter').default} el
 */
export default (el) => {
    const i18n_placeholder = __('Filter');
    const title_contact_filter = __('Filter by name');

    const filter_text = el.model.get('text');
    const filter_type = el.model.get('type');

    const is_overlay_mode = api.settings.get('view_mode') === 'overlayed';

    return html` <form
        class="items-filter-form input-button-group ${!el.shouldBeVisible() ? 'hidden' : 'fade-in'}"
        @submit=${(ev) => el.submitFilter(ev)}
    >
        <div class="${is_overlay_mode ? '' : 'd-flex flex-nowrap align-items-center'}">
            <div class="filter-by d-flex flex-nowrap">
                <converse-icon
                    size="1em"
                    @click=${(ev) => el.changeTypeFilter(ev)}
                    class="fa fa-user clickable ${filter_type === 'items' ? 'selected' : ''}"
                    data-type="items"
                    title="${title_contact_filter}"
                ></converse-icon>
            </div>
            <div class="btn-group">
                <input
                    .value="${filter_text || ''}"
                    @keydown=${(ev) => el.liveFilter(ev)}
                    class="items-filter form-control"
                    placeholder="${i18n_placeholder}"
                />
                <converse-icon
                    size="1em"
                    class="fa fa-times clear-input ${!filter_text ? 'hidden' : ''}"
                    @click=${(ev) => el.clearFilter(ev)}
                >
                </converse-icon>
            </div>
        </div>
    </form>`;
};

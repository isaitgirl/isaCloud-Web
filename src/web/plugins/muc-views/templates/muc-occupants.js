/**
 * @typedef {import('@converse/headless').MUCOccupant} MUCOccupant
 */
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { __ } from 'i18n';
import 'shared/components/list-filter.js';
import './../sidebar-occupant.js';
import tplOccupantsFilter from './occupants-filter.js';

/**
 * @param {import('../occupants').default} el
 * @param {MUCOccupant} occ
 */
function isOccupantFiltered(el, occ) {
    if (!el.model.get('filter_visible')) return false;
    if (el.filter.get('type') !== 'items') return false;

    const q = el.filter.get('text')?.toLowerCase();
    if (!q) return false;

    return !occ.getDisplayName().toLowerCase().includes(q);
}

/**
 * @param {import('../occupants').default} el
 */
export default (el) => {
    const i18n_participants = el.model.occupants === 1 ? __('Participant') : __('Participants');
    const i18n_hide_participants = __('Hide participants');
    const is_filter_visible = el.model.get('filter_visible');

    const is_stale = el.isStale();
    const i18n_stale = __('As last seen. You are not in this groupchat while offline.');
    return html`
        <div class="occupants ${is_stale ? 'occupants--stale' : ''}">
            <div class="occupants-header">
                <div class="occupants-header--title">
                    <span class="occupants-heading sidebar-heading"
                        >${el.model.occupants.length} ${i18n_participants}</span
                    >
                    <i
                        class="hide-occupants"
                        title="${i18n_hide_participants}"
                        aria-label="${i18n_hide_participants}"
                        @click=${(/** @type {MouseEvent} */ ev) => el.closeSidebar(ev)}
                    >
                        <converse-icon class="fa fa-angle-double-right" size="1em"></converse-icon>
                    </i>
                </div>
                ${is_stale ? html`<p class="occupants-stale-note" role="note">${i18n_stale}</p>` : ''}
            </div>
            <ul class="items-list occupant-list">
                ${
                    is_filter_visible
                        ? html` <converse-list-filter
                              .always_visible=${true}
                              @update=${() => el.requestUpdate()}
                              .promise=${el.model.initialized}
                              .items=${el.model.occupants}
                              .template=${tplOccupantsFilter}
                              .model=${el.filter}
                          ></converse-list-filter>`
                        : ''
                }
                ${repeat(
                    el.model.occupants.models,
                    (occ) => occ.get('jid'),
                    (occ) =>
                        isOccupantFiltered(el, occ)
                            ? ''
                            : html`<converse-muc-occupant-list-item .muc="${el.model}" .model="${occ}" />`,
                )}
            </ul>
        </div>
    `;
};

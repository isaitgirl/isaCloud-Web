/**
 * @typedef {import('../view').RoomsList} RoomsList
 * @typedef {import('@converse/headless').MUC} MUC
 * @typedef {import('lit').TemplateResult} TemplateResult
 */
import { html } from 'lit';
import { api, constants } from '@converse/headless';
import 'plugins/muc-views/modals/add-muc.js';
import 'plugins/muc-views/modals/muc-list.js';
import { __ } from 'i18n';
import '../styles/roomsgroups.scss';
import { tplRoomItem } from 'shared/roomslist/templates/room-item.js';

const { CLOSED } = constants;

/**
 * @param {RoomsList} el
 * @param {string} domain
 * @param {MUC[]} rooms
 */
function tplRoomDomainGroup(el, domain, rooms) {
    const i18n_title = __('Click to hide these rooms');
    const collapsed = el.model.get('collapsed_domains');
    const is_collapsed = collapsed.includes(domain);
    return html` <div class="muc-domain-group" data-domain="${domain}">
        <a
            href="#"
            class="list-toggle muc-domain-group-toggle controlbox-padded"
            title="${i18n_title}"
            @click=${(/** @type {Event} */ ev) => el.toggleDomainList(ev, domain)}
        >
            <converse-icon
                class="fa ${is_collapsed ? 'fa-caret-right' : 'fa-caret-down'}"
                size="1em"
                color="var(--muc-color)"
            ></converse-icon>
            ${domain}
        </a>
        <ul class="items-list muc-domain-group-rooms ${is_collapsed ? 'collapsed' : ''}" data-domain="${domain}">
            ${rooms.map((room) => tplRoomItem(el, room))}
        </ul>
    </div>`;
}

/**
 * @param {RoomsList} el
 * @param {MUC[]} rooms
 */
function tplRoomDomainGroupList(el, rooms) {
    // The rooms should stay sorted as they are iterated and added in order
    const grouped_rooms = new Map();
    for (const room of rooms) {
        const roomdomain = room.get('jid').split('@').at(-1).toLowerCase();
        if (grouped_rooms.has(roomdomain)) {
            grouped_rooms.get(roomdomain).push(room);
        } else {
            grouped_rooms.set(roomdomain, [room]);
        }
    }
    const sorted_domains = Array.from(grouped_rooms.keys());
    sorted_domains.sort();

    return sorted_domains.map((domain) => tplRoomDomainGroup(el, domain, grouped_rooms.get(domain)));
}

/** @param {MUC} room */
const isGroup = (room) => room.isGroup();

/**
 * Groups and channels as two sections of their own, each with its heading and
 * menu, shown even when empty so the menu stays reachable. Groups are private
 * and not listed by the server, so their menu has no "Query server".
 * @param {RoomsList} el
 * @param {MUC[]} pinned
 * @param {MUC[]} unpinned
 * @param {{ query: TemplateResult, bookmarks: TemplateResult }} items
 */
function tplRoomKindSections(el, pinned, unpinned, items) {
    const rooms = [...pinned, ...unpinned];
    /**
     * @param {string} label
     * @param {'group'|'channel'} kind
     */
    const tplAdd = (label, kind) =>
        html`<a
            class="dropdown-item show-add-muc-modal show-add-muc-modal--${kind}"
            role="button"
            @click="${(ev) => api.modal.show('converse-add-muc-modal', { 'model': el.model, kind }, ev)}"
        >
            <converse-icon class="fa fa-plus" size="1em"></converse-icon>
            ${label}
        </a>`;
    const kinds = [
        {
            kind: 'groups',
            label: __('Groups'),
            toggle_title: __('Click to toggle groups'),
            color: 'var(--chat-color)',
            rooms: rooms.filter(isGroup),
            btns: [tplAdd(__('Add group'), 'group'), items.bookmarks],
        },
        {
            kind: 'channels',
            label: __('Channels'),
            toggle_title: __('Click to toggle channels'),
            color: 'var(--muc-color)',
            rooms: rooms.filter((room) => !isGroup(room)),
            btns: [tplAdd(__('Add channel'), 'channel'), items.query, items.bookmarks],
        },
    ];
    const collapsed = el.model.get('collapsed_kinds') ?? [];
    return kinds.map(({ kind, label, toggle_title, color, rooms, btns }) => {
        const is_collapsed = collapsed.includes(kind);
        return html`<div class="d-flex controlbox-padded rooms-kind-heading rooms-kind-heading--${kind}">
                <span class="controlbox-heading controlbox-heading--groupchats controlbox-heading--${kind}">
                    <a
                        class="list-toggle rooms-kind-toggle"
                        role="heading"
                        aria-level="3"
                        aria-expanded="${!is_collapsed}"
                        title="${toggle_title}"
                        @click=${(/** @type {Event} */ ev) => el.toggleKindList(ev, kind)}
                    >
                        ${label}
                        ${
                            rooms.length
                                ? html`<converse-icon
                                      class="fa ${is_collapsed ? 'fa-caret-right' : 'fa-caret-down'}"
                                      size="1em"
                                      color="${color}"
                                  ></converse-icon>`
                                : ''
                        }
                    </a>
                </span>
                <converse-dropdown class="btn-group dropstart" .items=${btns}></converse-dropdown>
            </div>
            ${
                rooms.length && !is_collapsed
                    ? html`<div class="list-container list-container--openrooms rooms-kind rooms-kind--${kind}">
                          <ul class="items-list rooms-list open-rooms-list">
                              ${rooms.map((room) => tplRoomItem(el, room))}
                          </ul>
                      </div>`
                    : ''
            }`;
    });
}

/**
 * The pinned rooms, rendered before all other rooms. The `Pinned` label is
 * only needed to explain the ordering when unpinned rooms follow.
 * @param {RoomsList} el
 * @param {MUC[]} pinned
 * @param {boolean} show_label
 */
function tplPinnedRooms(el, pinned, show_label) {
    if (!show_label) return pinned.map((room) => tplRoomItem(el, room));

    const heading_id = `${el.model.get('id')}-pinned-heading`;
    return html`<li class="rooms-list-pinned">
        <span class="rooms-list-subheading controlbox-padded" id="${heading_id}">${__('Pinned')}</span>
        <ul class="items-list rooms-list-pinned__rooms" aria-labelledby="${heading_id}">
            ${pinned.map((room) => tplRoomItem(el, room))}
        </ul>
    </li>`;
}

/**
 * @param {RoomsList} el
 */
export default (el) => {
    const group_by_domain = api.settings.get('muc_grouped_by_domain');
    const group_by_kind = api.settings.get('muc_grouped_by_kind');
    const { pinned, unpinned } = el.getRoomPartitions();
    const rooms = [...pinned, ...unpinned];
    const i18n_desc_rooms = __('Click to toggle the list of open groupchats');
    const i18n_heading_chatrooms = __('Groupchats');
    const i18n_title_list_rooms = __('Query server');
    const i18n_title_new_room = __('Add groupchat');
    const i18n_show_bookmarks = __('Bookmarks');
    const is_closed = el.model.get('toggle_state') === CLOSED;

    const btns = [
        html`<a
            class="dropdown-item show-add-muc-modal"
            role="button"
            @click="${(ev) => api.modal.show('converse-add-muc-modal', { 'model': el.model }, ev)}"
            data-toggle="modal"
            data-target="#add-chatrooms-modal"
        >
            <converse-icon class="fa fa-plus" size="1em"></converse-icon>
            ${i18n_title_new_room}
        </a>`,
        html`<a
            class="dropdown-item show-list-muc-modal"
            role="button"
            @click="${(ev) => api.modal.show('converse-muc-list-modal', { 'model': el.model }, ev)}"
            data-toggle="modal"
            data-target="#muc-list-modal"
        >
            <converse-icon class="fa fa-list-ul" size="1em"></converse-icon>
            ${i18n_title_list_rooms}
        </a>`,
        html`<a
            class="dropdown-item show-bookmark-list-modal"
            role="button"
            @click="${(ev) => api.modal.show('converse-bookmark-list-modal', { 'model': el.model }, ev)}"
            data-toggle="modal"
        >
            <converse-icon class="fa fa-bookmark" size="1em"></converse-icon>
            ${i18n_show_bookmarks}
        </a>`,
    ];

    if (group_by_kind) {
        const [, query, bookmarks] = btns;
        return tplRoomKindSections(el, pinned, unpinned, { query, bookmarks });
    }

    return html` <div class="d-flex controlbox-padded">
            <span class="controlbox-heading controlbox-heading--groupchats">
                <a
                    class="list-toggle open-rooms-toggle"
                    role="heading"
                    aria-level="3"
                    title="${i18n_desc_rooms}"
                    @click=${(/** @type {Event} */ ev) => el.toggleRoomsList(ev)}
                >
                    ${i18n_heading_chatrooms}
                    ${
                        rooms.length
                            ? html`<converse-icon
                                  class="fa ${is_closed ? 'fa-caret-right' : 'fa-caret-down'}"
                                  size="1em"
                                  color="var(--muc-color)"
                              ></converse-icon>`
                            : ''
                    }
                </a>
            </span>
            <converse-dropdown class="btn-group dropstart" .items=${btns}></converse-dropdown>
        </div>

        <div class="list-container list-container--openrooms ${rooms.length ? '' : 'hidden'}">
            <ul class="items-list rooms-list open-rooms-list ${is_closed ? 'collapsed' : ''}">
                ${tplPinnedRooms(el, pinned, pinned.length > 0 && unpinned.length > 0)}
                ${
                    group_by_domain
                        ? tplRoomDomainGroupList(el, unpinned)
                        : unpinned.map(/** @param {MUC} room */ (room) => tplRoomItem(el, room))
                }
            </ul>
        </div>`;
};

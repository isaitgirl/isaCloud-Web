import { __ } from 'i18n';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import spinner from 'templates/spinner.js';

const form = (o) => {
    const i18n_query = __('Show groupchats');
    const i18n_server_address = __('Server address');
    return html`
        <form class="converse-form list-chatrooms" @submit=${o.submitForm}>
            <div>
                <label class="form-label" for="chatroom">${i18n_server_address}:</label>
                <input
                    type="text"
                    autofocus
                    @change=${o.setDomainFromEvent}
                    value="${o.muc_domain || ''}"
                    required="required"
                    name="server"
                    class="form-control"
                    placeholder="${o.server_placeholder}"
                />
            </div>
            <input type="submit" class="btn btn-primary" name="list" value="${i18n_query}" />
        </form>
    `;
};

const tplItem = (o, item) => {
    const i18n_info_title = o.channels
        ? __('Show more information on this channel')
        : __('Show more information on this groupchat');
    const i18n_join = o.channels ? __('Join this channel') : __('Join this groupchat');
    return html`
        <li class="room-item list-group-item">
            <div class="available-chatroom d-flex flex-row align-items-center">
                <span class="available-room w-100">
                    <span class="available-room__name">${item.name || item.jid}</span>
                    ${o.show_service ? html`<small class="available-room__service">${item.service}</small>` : ''}
                </span>
                <a
                    class="right room-info icon-room-info"
                    @click=${o.toggleRoomInfo}
                    data-room-jid="${item.jid}"
                    title="${i18n_info_title}"
                    aria-label="${i18n_info_title}"
                    href="#"
                    ><converse-icon class="fa fa-info-circle" size="1em" aria-hidden="true"></converse-icon
                ></a>
                <button
                    type="button"
                    class="btn open-room available-room__join"
                    @click=${o.openRoom}
                    data-room-jid="${item.jid}"
                    data-room-name="${item.name}"
                    title="${i18n_join}"
                    aria-label="${i18n_join}"
                >
                    <converse-icon class="fa fa-sign-in-thin" size="1.1em" aria-hidden="true"></converse-icon>
                </button>
            </div>
        </li>
    `;
};

export default (o) => {
    return html`
        ${o.show_form ? form(o) : ''}
        <ul class="available-chatrooms list-group">
            ${o.loading_items ? html`<li class="list-group-item">${spinner()}</li>` : ''}
            ${o.feedback_text ? html`<li class="list-group-item active">${o.feedback_text}</li>` : ''}
            ${repeat(
                o.items,
                (item) => item.jid,
                (item) => tplItem(o, item),
            )}
        </ul>
    `;
};

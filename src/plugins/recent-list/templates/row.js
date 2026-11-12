/**
 * @typedef {import('../view').RecentList} RecentList
 * @typedef {import('@converse/headless').Model} Model
 */
import { html } from 'lit';
import { u } from '@converse/headless';
import { __ } from 'i18n';
import { formatActivityTime, formatUnreadCount, getPreview, getUnreadCount, isUnread } from '../utils.js';

/** @param {Model} model */
function isCurrentlyOpen(model) {
    return u.isUniView() && !model.get('hidden') && !model.get('closed');
}

/**
 * @param {string} kind
 */
function tplKindBadge(kind) {
    if (kind === 'channel') {
        return html`<span class="recent-item__kind recent-item__kind--channel" aria-hidden="true">#</span>`;
    }
    return html`<span class="recent-item__kind recent-item__kind--group" aria-hidden="true"
        ><converse-icon class="fa fa-users" size="0.7em" color="#fff"></converse-icon
    ></span>`;
}

/**
 * @param {Model} model
 */
function tplUnreadBadge(model) {
    if (!isUnread(model)) return '';
    const count = getUnreadCount(model);
    if (count > 0) return html`<span class="recent-item__unread">${formatUnreadCount(count)}</span>`;
    return html`<span class="recent-item__dot" aria-hidden="true"></span>`;
}

/**
 * @param {Object} config
 * @param {string} config.text
 * @param {string} config.title
 * @param {string} config.icon_class
 * @param {(ev: Event) => void} config.handler
 */
function tplMenuItem({ text, title, icon_class, handler }) {
    return html`<a class="dropdown-item" role="button" tabindex="0" title="${title}" @click=${handler}>
        <converse-icon aria-hidden="true" class="fa ${icon_class}" size="1em"></converse-icon>
        ${text}
    </a>`;
}

/**
 * One row of the conversation list.
 * @param {RecentList} el
 * @param {{ model: Model, kind: string, activity: number }} item
 */
export default function tplRecentRow(el, { model, kind, activity }) {
    const is_room = kind !== 'chat';
    const is_unread = isUnread(model);
    const preview = getPreview(model);
    const buttons = is_room
        ? [
              tplMenuItem({
                  text: __('Leave this groupchat'),
                  title: __('Leave this groupchat'),
                  icon_class: 'fa-sign-out-alt',
                  handler: () => el.leaveRoom(model),
              }),
          ]
        : [
              tplMenuItem({
                  text: __('Remove from list'),
                  title: __('Remove from list'),
                  icon_class: 'fa-times',
                  handler: () => el.removeChat(model),
              }),
          ];

    return html`<li
        class="recent-item ${isCurrentlyOpen(model) ? 'open' : ''} ${is_unread ? 'unread' : ''} ${model.get('closed') ? 'closed' : ''}"
        data-jid="${model.get('jid')}"
    >
        <a
            href="#"
            class="recent-item__link"
            title="${__('Click to open this conversation')}"
            @click=${(/** @type {Event} */ ev) => el.openConversation(ev, model)}
        >
            <span class="recent-item__avatar">
                <converse-avatar
                    .model=${model}
                    class="avatar ${is_room ? 'avatar-muc' : ''}"
                    name=${model.getDisplayName()}
                    nonce=${model.vcard?.get('vcard_updated')}
                    height="44"
                    width="44"
                ></converse-avatar>
                ${is_room ? tplKindBadge(kind) : ''} ${tplUnreadBadge(model)}
            </span>
            <span class="recent-item__body">
                <span class="recent-item__name">${model.getDisplayName()}</span>
                <span class="recent-item__preview"
                    >${preview.prefix ? html`<span class="recent-item__prefix">${`${preview.prefix}: `}</span>` : ''}${preview.text}</span
                >
            </span>
            <time class="recent-item__time">${formatActivityTime(activity)}</time>
        </a>
        <converse-dropdown class="btn-group dropstart recent-item__action" .items=${buttons}></converse-dropdown>
    </li>`;
}

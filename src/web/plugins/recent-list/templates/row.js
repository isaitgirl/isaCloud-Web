/**
 * @typedef {import('../view').RecentList} RecentList
 * @typedef {import('@converse/headless').Model} Model
 */
import { html } from 'lit';
import { u } from '@converse/headless';
import { __ } from 'i18n';
import {
    canPin,
    formatActivityTime,
    formatUnreadCount,
    getPreview,
    getUnreadCount,
    isNotesToSelf,
    isPinned,
    isUnread,
    togglePin,
} from '../utils.js';

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
 * @param {string} [config.item_class] Extra class, for tests and styling.
 * @param {boolean} [config.disabled] Render the item inert, without a handler.
 * @param {(ev: Event) => void} [config.handler]
 */
function tplMenuItem({ text, title, icon_class, item_class, disabled, handler }) {
    const classes = ['dropdown-item', disabled ? 'disabled' : '', item_class ?? ''].filter(Boolean).join(' ');
    if (disabled) {
        return html`<a
            class="${classes}"
            role="button"
            tabindex="-1"
            aria-disabled="true"
            title="${title}"
            aria-label="${text}. ${title}"
        >
            <converse-icon aria-hidden="true" class="fa ${icon_class}" size="1em"></converse-icon>
            ${text}
        </a>`;
    }
    return html`<a class="${classes}" role="button" tabindex="0" title="${title}" @click=${handler}>
        <converse-icon aria-hidden="true" class="fa ${icon_class}" size="1em"></converse-icon>
        ${text}
    </a>`;
}

/**
 * The pin/unpin entry of the row's menu. When the limit is reached, the entry
 * stays visible but disabled, so the user can see why it does nothing.
 * @param {Model} model
 */
function tplPinMenuItem(model) {
    if (isPinned(model)) {
        return tplMenuItem({
            text: __('Unpin from top'),
            title: __('Unpin from top'),
            icon_class: 'fa-thumbtack',
            item_class: 'unpin-conversation',
            handler: () => togglePin(model),
        });
    }
    if (!canPin(model)) {
        return tplMenuItem({
            text: __('Pin to top'),
            title: __('You can pin up to 3 conversations'),
            icon_class: 'fa-thumbtack',
            item_class: 'pin-conversation',
            disabled: true,
        });
    }
    return tplMenuItem({
        text: __('Pin to top'),
        title: __('Pin to top'),
        icon_class: 'fa-thumbtack',
        item_class: 'pin-conversation',
        handler: () => togglePin(model),
    });
}

/**
 * The pin indicator shown on the right of a pinned row. Pinned rows are marked
 * only by this icon; they stay in the single list.
 * @param {Model} model
 */
function tplPinIndicator(model) {
    if (!isPinned(model)) return '';
    const label = __('Pinned conversation');
    return html`<span class="recent-item__pin" role="img" title="${label}" aria-label="${label}">
        <converse-icon class="fa fa-thumbtack" size="0.75em" aria-hidden="true"></converse-icon>
    </span>`;
}

/**
 * One row of the conversation list.
 * @param {RecentList} el
 * @param {{ model: Model, kind: string, activity: number, pinned_order: number }} item
 */
export default function tplRecentRow(el, { model, kind, activity }) {
    const is_room = kind !== 'chat';
    const is_notes = isNotesToSelf(model);
    const is_pinned = isPinned(model);
    const is_unread = isUnread(model);
    const preview = getPreview(model);
    // The pin comes first, then the action that removes the row, if any.
    const buttons = [tplPinMenuItem(model)];
    if (is_room) {
        buttons.push(
            tplMenuItem({
                text: __('Leave this groupchat'),
                title: __('Leave this groupchat'),
                icon_class: 'fa-sign-out-alt',
                handler: () => el.leaveRoom(model),
            }),
        );
    } else if (!is_notes) {
        buttons.push(
            tplMenuItem({
                text: __('Remove from list'),
                title: __('Remove from list'),
                icon_class: 'fa-times',
                handler: () => el.removeChat(model),
            }),
        );
    }

    return html`<li
        class="recent-item ${is_pinned ? 'pinned' : ''} ${isCurrentlyOpen(model) ? 'open' : ''} ${is_unread ? 'unread' : ''} ${model.get('closed') ? 'closed' : ''}"
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
            <span class="recent-item__meta">
                <time class="recent-item__time">${formatActivityTime(activity)}</time>
                ${tplPinIndicator(model)}
            </span>
        </a>
        <converse-dropdown class="btn-group dropstart recent-item__action" .items=${buttons}></converse-dropdown>
    </li>`;
}

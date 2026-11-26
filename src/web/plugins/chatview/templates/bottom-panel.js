import { __ } from 'i18n';
import { html } from 'lit';
import 'shared/chat/composer-panels.js';

/**
 * @param {import('../bottom-panel').default} el
 */
export default (el) => {
    const unread_msgs = __('You have unread messages');
    return html`
        ${
            el.model.ui.get('scrolled') && el.model.get('num_unread')
                ? html`<div
                      class="new-msgs-indicator"
                      @click=${/** @param {MouseEvent} ev */ (ev) => el.viewUnreadMessages(ev)}
                  >
                      ▼ ${unread_msgs} ▼
                  </div>`
                : ''
        }
        ${
            el.isReconnecting()
                ? html`<div class="reconnecting-notice bottom-panel__reconnecting" role="status" aria-live="polite">
                      <span class="reconnecting-notice__spinner" aria-hidden="true"></span>
                      <span class="reconnecting-notice__text">${__('Reconnecting…')}</span>
                  </div>`
                : ''
        }
        <converse-composer-panels .model=${el.model}></converse-composer-panels>
        <converse-message-form .model=${el.model}></converse-message-form>
    `;
};

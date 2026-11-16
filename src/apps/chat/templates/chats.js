import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { _converse, api, constants, converse } from '@converse/headless';
import { __ } from 'i18n';
import { isMobileViewport } from 'shared/chat/utils.js';

const { CONTROLBOX_TYPE, CHATROOMS_TYPE, HEADLINES_TYPE, CONNECTION_STATUS } = constants;

/**
 * @param {import('@converse/headless').ChatBoxBase} c
 */
function shouldShowChat(c) {
    const is_minimized = api.settings.get('view_mode') === 'overlayed' && c.get('hidden');
    return c.get('type') === CONTROLBOX_TYPE || (!c.get('hidden') && !c.get('closed') && !is_minimized);
}

export default () => {
    const { chatboxes, connfeedback } = _converse.state;
    const view_mode = api.settings.get('view_mode');
    const is_overlayed = view_mode === 'overlayed';
    const is_mobile = isMobileViewport();
    const connection = api.connection.get();
    const logged_out = !connection?.connected || !connection?.authenticated || connection?.disconnecting;
    const connection_status = connfeedback.get('connection_status');
    const connecting = ['CONNECTED', 'CONNECTING', 'AUTHENTICATING', 'RECONNECTING'].includes(
        CONNECTION_STATUS[connection_status],
    );
    // `filter` hands the models over; Skeletor's `some` would hand their attributes.
    const has_visible_conversation =
        chatboxes.filter((c) => c.get('type') !== CONTROLBOX_TYPE && !c.get('hidden') && !c.get('closed')).length > 0;
    return html`
        ${
            !logged_out && is_overlayed
                ? html`<converse-minimized-chats class="col-auto"></converse-minimized-chats>`
                : ''
        }
        ${repeat(
            chatboxes.filter(shouldShowChat),
            (m) => m.get('jid'),
            (m) => {
                const width = m.get('width');
                const style = !is_mobile && is_overlayed && width ? `width: ${width}px` : nothing;
                if (m.get('type') === CONTROLBOX_TYPE) {
                    return is_overlayed && m.get('closed')
                        ? html`<converse-controlbox-toggle class="col-auto"></converse-controlbox-toggle>`
                        : html`<converse-controlbox
                              id="controlbox"
                              class="col-auto chatbox ${logged_out && !connecting ? 'logged-out' : ''}"
                              style="${style}"
                          ></converse-controlbox>`;
                } else if (m.get('type') === CHATROOMS_TYPE) {
                    return html`
                        <converse-muc
                            jid="${m.get('jid')}"
                            class="col-auto chatbox chatroom"
                            style="${style}"
                        ></converse-muc>
                    `;
                } else if (m.get('type') === HEADLINES_TYPE) {
                    return html`
                        <converse-headlines
                            jid="${m.get('jid')}"
                            class="col-auto chatbox headlines"
                            style="${style}"
                        ></converse-headlines>
                    `;
                } else {
                    return html`<converse-chat
                        jid="${m.get('jid')}"
                        class="col-auto chatbox"
                        style="${style}"
                    ></converse-chat> `;
                }
            },
        )}
        ${
            !logged_out && view_mode === 'fullscreen' && !has_visible_conversation
                ? html`<div class="chat-placeholder">
                      <div class="chat-placeholder__center">
                          <converse-logo class="chat-placeholder__logo"></converse-logo>
                          <p class="chat-placeholder__version">${converse.env.VERSION_NAME}</p>
                      </div>
                      <p class="chat-placeholder__encryption">
                          <converse-icon class="fa fa-lock" size="1em" aria-hidden="true"></converse-icon>
                          <span>${__('Your personal messages are end-to-end encrypted')}</span>
                      </p>
                  </div>`
                : ''
        }
    `;
};

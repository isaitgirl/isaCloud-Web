/**
 * @description
 *  isaCloud: video conferences, phase 1 (Galene through the meet-api).
 *
 *  The plugin adds a video call button to the chat toolbar, right after the
 *  audio call button that Converse's Jingle UI already shows in 1:1 chats.
 *  Picking it creates a room on the configured conference service, remembers
 *  the host URL (a credential) in `localStorage`, scoped by account and room,
 *  and puts the public `/join/<roomID>` link in the composer without sending
 *  it. The person reviewing the message can then send it; clicking the link in
 *  a message later opens the host URL when this browser and account have a
 *  valid one for that room, and the public page otherwise.
 *
 *  Hooks used:
 *  - `getToolbarButtons` (the button, next to the audio call one);
 *  - `getMessageLinkTarget` (swaps a public link for its host URL; see
 *    `src/shared/chat/message.js`).
 *
 *  The host enters by sending the message and clicking the public link in it:
 *  `getMessageLinkTarget` swaps that link for the stored host URL. Nothing is
 *  opened when the room is created, so there is no pop-up to allow and no
 *  extra dialog: the link in the conversation is the way in for everyone.
 *
 *  Strings are in pt-BR through `i18n.js`, without `.po` edits. The icon
 *  (`icon.js`) is the plugin's own SVG symbol.
 *
 *  See isacloud-docs analysis 2026-11-21-video-conferencia (private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { _converse, api, constants, converse } from '@converse/headless';
import { createRoom } from './meet-api.js';
import { clearAccount, getHostURL, saveRoom } from './store.js';
import { DEFAULT_CONFERENCE_URL, isMeetURL, normalizeBase, roomIDFromURL } from './links.js';
import { t } from './i18n.js';
import { CONFERENCE_ICON, registerConferenceIcon } from './icon.js';

const { Strophe } = converse.env;
const { PRIVATE_CHAT_TYPE } = constants;

// The conversations whose conference is being created. The toolbar button
// stays put while the request runs, so a second click is ignored rather than
// creating a second room.
/** @type {WeakSet<any>} */
const pending = new WeakSet();

/**
 * @returns {string} The configured conference service, without a trailing slash.
 */
function conferenceBase() {
    return normalizeBase(api.settings.get('isacloud_conference_url'));
}

/**
 * @returns {string|undefined}
 */
function bareJID() {
    return _converse.session.get('bare_jid');
}

/**
 * The name the room is created under: the account's nickname, then its display
 * name, and the local part of the JID when neither is usable (a display name
 * that is only the JID is not a name).
 * @returns {string}
 */
function hostName() {
    const { profile } = _converse.state;
    const name = String(profile.getNickname() || profile.getDisplayName() || '').trim();
    if (name && !name.includes('@')) return name;
    const bare_jid = bareJID();
    return (bare_jid && Strophe.getNodeFromJid(bare_jid)) || '';
}

/**
 * `getToolbarButtons` handler: a video conference button in 1:1 chats,
 * inserted right after the audio call button that the Jingle UI adds.
 * @param {import('shared/chat/toolbar').ChatToolbar} toolbar_el
 * @param {import('lit').TemplateResult[]} buttons
 * @returns {import('lit').TemplateResult[]}
 */
function getConferenceToolbarButton(toolbar_el, buttons) {
    const { model } = toolbar_el;
    if (model.get('type') !== PRIVATE_CHAT_TYPE) return buttons;
    const label = t('Start a video conference');
    const button = html`<button
        type="button"
        class="btn start-conference"
        title="${label}"
        aria-label="${label}"
        @click=${(/** @type {MouseEvent} */ ev) => {
            ev.preventDefault();
            createConference(toolbar_el);
        }}
    >
        <converse-icon color="var(--chat-color)" class="fa ${CONFERENCE_ICON}" size="1.2em"></converse-icon>
    </button>`;
    // The Jingle UI adds the audio call button before this plugin runs, so put
    // the camera right after it. Other plugins (OMEMO, stickers) may add their
    // buttons later; without a phone, append, which is where it belongs.
    const phone = buttons.findIndex((b) => b?.strings?.join('')?.includes('start-call'));
    const result = [...buttons];
    result.splice(phone >= 0 ? phone + 1 : result.length, 0, button);
    return result;
}

/**
 * Creates a conference for the conversation whose toolbar was used: remembers
 * the host URL and puts the public link in the composer, without sending it.
 * The host enters later by clicking that link in the message, which
 * `getMessageLinkTarget` swaps for the host URL. On failure, nothing is
 * inserted.
 * @param {import('shared/chat/toolbar').ChatToolbar} source
 * @returns {Promise<void>}
 */
export async function createConference(source) {
    const model = source.model;
    if (pending.has(model)) return;
    pending.add(model);

    try {
        const base = conferenceBase();
        const room = await createRoom(hostName(), base);
        const bare_jid = bareJID();
        if (bare_jid) saveRoom(bare_jid, room, base);
        /** @type {HTMLElement & { insertAtCaret: (text: string) => void }|null} */
        const form = /** @type {any} */ (source.closest('converse-message-form, converse-muc-message-form'));
        form?.insertAtCaret(`${t('Access the video conference via the link:')} ${room.roomURL}`);
        api.toast.show('conference-created', {
            type: 'info',
            title: t('Video conference'),
            body: t('Conference created. The link is in the message field.'),
        });
    } catch {
        api.toast.show('conference-error', {
            type: 'danger',
            title: t('Video conference'),
            body: t('Could not create the conference. Please try again.'),
        });
    } finally {
        pending.delete(model);
    }
}

/**
 * `getMessageLinkTarget` handler: a public conference link opens the host URL
 * when this account has a valid one for that room.
 * @param {HTMLAnchorElement} _link
 * @param {{ url: string }} data
 * @returns {{ url: string }}
 */
function getConferenceLinkTarget(_link, data) {
    const base = conferenceBase();
    const room_id = roomIDFromURL(data.url, base);
    if (!room_id) return data;
    const bare_jid = bareJID();
    if (!bare_jid) return data;
    const host_url = getHostURL(bare_jid, room_id, base);
    if (!host_url || !isMeetURL(host_url, base)) return data;
    return { ...data, url: host_url };
}

converse.plugins.add('converse-isacloud-conference', {
    dependencies: ['converse-chatview', 'converse-muc-views', 'converse-modal'],

    initialize() {
        api.settings.extend({
            /** Base URL of the Galene/meet-api deployment. */
            isacloud_conference_url: DEFAULT_CONFERENCE_URL,
        });

        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_conference = {
            createConference,
            createRoom,
            getHostURL,
            saveRoom,
            clearAccount,
            roomIDFromURL,
            isMeetURL,
        };

        api.listen.on('getToolbarButtons', getConferenceToolbarButton);
        api.listen.on('getMessageLinkTarget', getConferenceLinkTarget);
        registerConferenceIcon();
    },
});

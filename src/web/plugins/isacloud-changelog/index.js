/**
 * @description
 *  isaCloud: "Novidades do isaCloud". A pseudo-conversation at the top of the
 *  recent conversations list shows the user-facing changelog of the current
 *  release (or of the releases since the last visit after an update). It can be
 *  archived from its own icon, which only hides the row; Settings → About still
 *  opens the same view.
 *
 *  The changelog is embedded in the bundle from `CHANGELOG-USERS.md`
 *  (`changelog.json`, checked by `scripts/generate-changelog-json.mjs`). The
 *  state is per account and mirrors the Android app: a first run shows only the
 *  current release, read/archived state survives reloads, and a newer version
 *  makes an archived row come back.
 *
 *  The view is not a ChatBox: it is a card appended to the Chat app, so it never
 *  enters the chatboxes collection, MAM or the unread counts. The app's render
 *  is wrapped for that; the same pattern is used by `isacloud-update` for the
 *  settings button.
 *
 *  See isacloud-docs analysis 2026-11-23-novidades-lista (private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { _converse, api, converse, log } from '@converse/headless';
import { changelog_api, changelog_state, closeChangelog, startChangelog, stopChangelog } from './state.js';
import ChangelogAboutLink from './about.js';
import ChangelogView from './view.js';
import './styles/changelog.scss';

const WRAPPED = Symbol('isacloud-changelog-wrapped');

/**
 * Appends the changelog view to the Chat app. The view hides itself when
 * closed, so the app's render does not have to know about it.
 * @returns {void}
 */
function wrapChatApp() {
    const proto = customElements.get('converse-app-chat')?.prototype;
    if (!proto || typeof proto.render !== 'function') {
        log.warn('isacloud-changelog: converse-app-chat not found, the changelog view will not be shown');
        return;
    }
    if (proto[WRAPPED]) return;

    const original = proto.render;
    proto.render = function () {
        return html`${original.call(this)}<converse-isacloud-changelog></converse-isacloud-changelog>`;
    };
    proto[WRAPPED] = true;
}

converse.plugins.add('converse-isacloud-changelog', {
    dependencies: ['converse-app-chat', 'converse-recent-list', 'converse-controlbox', 'converse-profile'],

    initialize() {
        api.settings.extend({
            /** Whether the row, the view and the About entry are on. */
            isacloud_changelog: true,
            /** The full changelog, opened in a new window from the view and About. */
            isacloud_changelog_github_url: 'https://github.com/isaitgirl/isaCloud-Web/blob/isacloud/CHANGELOG-USERS.md',
        });

        // Defined even when the feature is off, so the tag in the About tab
        // renders nothing instead of an unknown element.
        api.elements.define('converse-isacloud-changelog-link', ChangelogAboutLink);

        // The row and the view belong to the fullscreen conversation layout;
        // other modes have no conversation list and no place for the card.
        if (!api.settings.get('isacloud_changelog') || api.settings.get('view_mode') !== 'fullscreen') return;

        changelog_state.enabled = true;
        changelog_state.current_version = converse.env.VERSION_NAME;

        api.elements.define('converse-isacloud-changelog', ChangelogView);

        api.listen.on('connected', () => startChangelog(_converse.session.get('bare_jid')));
        api.listen.on('clearSession', stopChangelog);
        // Opening a real conversation means leaving the news view.
        api.listen.on('openConversation', closeChangelog);

        if (customElements.get('converse-app-chat')) wrapChatApp();
        else customElements.whenDefined('converse-app-chat').then(wrapChatApp);

        // Shared with the specs, which need the same module state as the plugin.
        Object.assign(_converse.exports, { isacloud_changelog: changelog_api });
    },
});

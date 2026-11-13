/**
 * @description
 *  isaCloud: a "new version" notice. When a newer build of the page has been
 *  published, a pink refresh button appears next to the settings gear; clicking
 *  it drops the cached files and reloads into the new version.
 *
 *  isacloud/build.sh writes the version (the commit) into the page, as
 *  `<meta name="isacloud-version">`, and into `version.json`. The plugin
 *  fetches `version.json` (uncached) every `isacloud_update_interval` seconds
 *  and whenever the tab becomes visible again, and compares. Pages not built
 *  that way have no version, so nothing is checked.
 *
 *  The reload asks the server's `isacloud_update_clear_url`, which answers with
 *  `Clear-Site-Data: "cache"` (nginx, see isacloud-docs), so that only the HTTP
 *  cache is dropped. IndexedDB and localStorage are never touched.
 *
 *  The settings gear's template (`controlbox/templates/buttons.js`) has no hook
 *  for more buttons, so this plugin wraps `render()` of
 *  `converse-controlbox-buttons` to put its own element before the gear. This
 *  replaces a missing hook; the spec fails if upstream renames that element.
 *
 *  See isacloud-docs analysis 2026-11-13-aviso-atualizacao (private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { _converse, api, converse, log } from '@converse/headless';
import { actions, checkForUpdate, getLoadedVersion, reloadWithNewVersion, update_state } from './update.js';
import './button.js';
import './styles/isacloud-update.scss';

const WRAPPED = Symbol('isacloud-update-wrapped');

/**
 * Puts the update button before the settings gear.
 * @returns {void}
 */
function wrapControlboxButtons() {
    const proto = customElements.get('converse-controlbox-buttons')?.prototype;
    if (!proto || typeof proto.render !== 'function') {
        log.warn('isacloud-update: converse-controlbox-buttons not found, the update notice will not be shown');
        return;
    }
    if (proto[WRAPPED]) return;
    const original = proto.render;
    /** @this {any} */
    proto.render = function () {
        return html`<div class="isacloud-update-wrap">
            <converse-isacloud-update-button></converse-isacloud-update-button>${original.call(this)}
        </div>`;
    };
    proto[WRAPPED] = true;
}

let started = false;

/**
 * Checks now, then every `isacloud_update_interval` seconds and whenever the
 * tab is shown again. Does nothing on a page without a version.
 * @returns {void}
 */
function startChecking() {
    if (started || !getLoadedVersion()) return;
    started = true;
    checkForUpdate();
    const seconds = Number(api.settings.get('isacloud_update_interval'));
    if (seconds > 0) setInterval(checkForUpdate, seconds * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
    });
}

converse.plugins.add('converse-isacloud-update', {
    dependencies: ['converse-controlbox', 'converse-profile'],

    initialize() {
        api.settings.extend({
            /** The version this page was built as; by default read from the page's meta tag. */
            isacloud_version: '',
            /** Where the published version is, relative to the page. */
            isacloud_update_url: 'version.json',
            /** Seconds between checks; 0 checks only when the tab is shown again. */
            isacloud_update_interval: 600,
            /** URL answering with `Clear-Site-Data: "cache"`; empty to skip it. */
            isacloud_update_clear_url: 'atualizar',
        });

        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_update = {
            actions,
            checkForUpdate,
            getLoadedVersion,
            reloadWithNewVersion,
            update_state,
        };

        api.listen.on('connected', startChecking);

        // The element is only registered when converse.initialize() runs, after plugins
        // have been initialized, so wait for it.
        customElements.whenDefined('converse-controlbox-buttons').then(wrapControlboxButtons);
    },
});

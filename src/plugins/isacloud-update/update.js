/**
 * @description
 *  isaCloud: knowing whether a newer version of the page was published, and
 *  reloading into it.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, log } from '@converse/headless';

/** Fired on `update_state` when a newer published version is found. */
export const UPDATE_EVENT = 'isacloud-update-available';

/** What the page knows about the published version. */
export const update_state = Object.assign(new EventTarget(), {
    /** @type {string|null} The newer published version, once one is found. */
    available: null,
});

/**
 * The version this page was built as: the `isacloud_version` setting if set,
 * else the `<meta name="isacloud-version">` that isacloud/build.sh fills in.
 * Empty on a page that was not built that way, which turns the checks off.
 * @returns {string}
 */
export function getLoadedVersion() {
    const setting = api.settings.get('isacloud_version');
    if (setting) return setting;
    return document.querySelector('meta[name="isacloud-version"]')?.getAttribute('content') ?? '';
}

/**
 * Asks the server for the published version and, if it differs from the loaded
 * one, records it and fires `UPDATE_EVENT`. Failures (offline, no file) count
 * as "no update".
 * @returns {Promise<boolean>} Whether a newer version is available.
 */
export async function checkForUpdate() {
    const loaded = getLoadedVersion();
    if (!loaded) return false;
    try {
        const url = new URL(api.settings.get('isacloud_update_url'), document.baseURI);
        url.searchParams.set('t', String(Date.now()));
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return !!update_state.available;
        const { version } = await response.json();
        if (typeof version === 'string' && version && version !== loaded && version !== update_state.available) {
            update_state.available = version;
            update_state.dispatchEvent(new Event(UPDATE_EVENT));
            /**
             * Triggered when a newer version of the page was published.
             * @event _converse#isacloudUpdateAvailable
             * @type {string}
             */
            api.trigger('isacloudUpdateAvailable', version);
        }
    } catch (e) {
        log.debug(`isacloud-update: could not check for a new version: ${e}`);
    }
    return !!update_state.available;
}

/**
 * Overridable by the specs, which cannot reload the test page.
 */
export const actions = {
    reload: () => window.location.reload(),
};

/**
 * Drops the cached copies of the page's files and reloads. Only the HTTP cache
 * goes: the server's clear URL answers with `Clear-Site-Data: "cache"`, which
 * leaves IndexedDB and localStorage (OMEMO keys, history, session, stickers)
 * alone. Any Cache Storage is emptied too, though the page uses none today.
 * @returns {Promise<void>}
 */
export async function reloadWithNewVersion() {
    const clear_url = api.settings.get('isacloud_update_clear_url');
    if (clear_url) {
        try {
            await fetch(new URL(clear_url, document.baseURI), { cache: 'no-store' });
        } catch (e) {
            log.debug(`isacloud-update: could not clear the cache: ${e}`);
        }
    }
    try {
        if (window.caches) {
            for (const key of await window.caches.keys()) await window.caches.delete(key);
        }
    } catch (e) {
        log.debug(`isacloud-update: could not empty Cache Storage: ${e}`);
    }
    actions.reload();
}

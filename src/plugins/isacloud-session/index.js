/**
 * @description
 *  isaCloud: ask for the password again once the browser is closed.
 *
 *  Converse normally reconnects on its own after a page load, using the last
 *  JID (kept in localStorage) and the SCRAM keys saved by a "trusted device"
 *  login. That also happens after the browser is reopened, so the session
 *  never actually ends.
 *
 *  This plugin adds a **session cookie** as a marker: if it is missing, the
 *  auto-login is skipped and the login form is shown. If it is present, the
 *  usual SCRAM auto-login runs, so reloading the page or opening another tab
 *  keeps the user logged in. The browser discards session cookies when it
 *  closes (unless it restores the previous session, see the analysis in
 *  isacloud-docs, 2026-11-16-login-por-sessao-do-browser).
 *
 *  The cookie holds no credential and no identity: it is only a marker saying
 *  "this browser session already logged in". Conversation history, OMEMO and
 *  settings live in IndexedDB/localStorage per account and are never touched,
 *  and logging in again does not erase them.
 *
 *  `initialize()` runs before the automatic `api.user.login()` call in
 *  `converse.initialize`, so `keepalive` can be turned off in time to keep the
 *  login form. The plugin is enabled only on the isaCloud page, through
 *  `whitelisted_plugins` in isacloud/index.html.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, converse } from '@converse/headless';

const SESSION_COOKIE = 'isacloud_session';

/**
 * The attributes shared by setting and clearing the cookie. `Secure` is only
 * valid over HTTPS, so it is left out on the local HTTP server.
 * @returns {string}
 */
function cookieAttributes() {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    return `; path=/; SameSite=Lax${secure}`;
}

/**
 * Whether this browser session already logged in. Without a DOM (headless
 * contexts), assume it did, so `keepalive` is not changed.
 * @returns {boolean}
 */
function hasSessionCookie() {
    if (typeof document === 'undefined') return true;
    return document.cookie.split('; ').some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/**
 * Writes the session cookie. No `Expires`/`Max-Age`, which is what makes it a
 * session cookie: the browser drops it when it closes.
 * @returns {void}
 */
function setSessionCookie() {
    if (typeof document === 'undefined') return;
    document.cookie = `${SESSION_COOKIE}=1${cookieAttributes()}`;
}

/**
 * Expires the session cookie, on logout or when the session is cleared.
 * @returns {void}
 */
function clearSessionCookie() {
    if (typeof document === 'undefined') return;
    document.cookie = `${SESSION_COOKIE}=${cookieAttributes()}; Max-Age=0`;
}

converse.plugins.add('converse-isacloud-session', {
    initialize() {
        // Runs before the auto-login in converse.initialize: without the marker,
        // do not reconnect on load and let the login form appear.
        if (!hasSessionCookie()) api.settings.set('keepalive', false);

        api.listen.on('connected', setSessionCookie);
        api.listen.on('reconnected', setSessionCookie);
        api.listen.on('clearSession', clearSessionCookie);
    },
});

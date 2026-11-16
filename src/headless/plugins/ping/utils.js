import api from '../../shared/api/index.js';
import converse from '../../shared/api/public.js';
import { isTestEnv } from '../../utils/session.js';
import { isAppHidden } from '../../utils/environment.js';

const { Strophe, stx } = converse.env;

let lastStanzaDate;

/**
 * Whether a connection that was up may have come back but is not
 * authenticated again yet.
 * @returns {boolean}
 */
function connectionMayBeBack() {
    const connection = api.connection.get();
    // A tab that was frozen can come back with a dead transport that Strophe
    // still believes is up.
    return Boolean(connection?.has_connected && !api.connection.authenticated());
}

/**
 * Reconnects straight away if the connection was up before but is no longer
 * authenticated, instead of waiting out a backoff that may already be at its
 * longest. Otherwise checks quickly, so a dead connection is noticed sooner
 * than the regular five seconds. A healthy connection is only pinged.
 *
 * Used for events that mean the network or the page came back. The page may
 * still be hidden here, so unlike {@link onWindowStateChanged} this does not
 * check `isAppHidden()`: the transport can die while the page is hidden.
 * @returns {Promise<boolean|null|void>|void}
 */
export function onConnectionMayBeBack() {
    if (connectionMayBeBack()) {
        return api.connection.reconnect();
    }
    return api.ping(null, 1500);
}

/**
 * The reconnect half of {@link onConnectionMayBeBack}, without the ping.
 *
 * Used for frequent events such as `focus`, where pinging would mean a
 * round-trip every time the window is switched.
 * @returns {void}
 */
export function reconnectIfNeeded() {
    if (connectionMayBeBack()) {
        api.connection.reconnect();
    }
}

/**
 * Called when the document's visibility changes.
 * @returns {void}
 */
export function onWindowStateChanged() {
    if (isAppHidden()) return;

    onConnectionMayBeBack();
}

export function setLastStanzaDate(date) {
    lastStanzaDate = date;
}

function pong(ping) {
    lastStanzaDate = new Date();
    const from = ping.getAttribute('from');
    const id = ping.getAttribute('id');
    const iq = stx`<iq type="result" to="${from}" id="${id}" xmlns="jabber:client"></iq>`;
    api.sendIQ(iq);
    return true;
}

export function registerPongHandler() {
    const connection = api.connection.get();
    if (connection.disco) {
        api.disco.own.features.add(Strophe.NS.PING);
    }
    return connection.addHandler(pong, Strophe.NS.PING, 'iq', 'get');
}

export function registerPingHandler() {
    api.connection.get()?.addHandler(() => {
        if (api.settings.get('ping_interval') > 0) {
            // Handler on each stanza, saves the received date
            // in order to ping only when needed.
            lastStanzaDate = new Date();
            return true;
        }
    });
}

let intervalId;

export function registerHandlers() {
    // Wrapper so that we can spy on registerPingHandler in tests
    registerPongHandler();
    registerPingHandler();
    clearInterval(intervalId);
    intervalId = setInterval(onEverySecond, 1000);
}

export function unregisterIntervalHandler() {
    clearInterval(intervalId);
}

export function onEverySecond() {
    if (isTestEnv() || !api.connection.authenticated()) {
        return;
    }
    const ping_interval = api.settings.get('ping_interval');
    if (ping_interval > 0) {
        const now = new Date();
        lastStanzaDate = lastStanzaDate ?? now;
        if ((now.valueOf() - lastStanzaDate.valueOf()) / 1000 > ping_interval) {
            api.ping();
        }
    }
}

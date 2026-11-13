import log from '@converse/log';
import { Strophe } from 'strophe.js';
import { settings_api } from '../settings/api.js';

/**
 * isaCloud: the prefix comes from the `resource_prefix` setting (Converse's
 * default is `converse.js`; the isaCloud page sets `isaCloudWeb`).
 * @returns {string} A resource to append to a bare JID, with its slash.
 */
export function generateResource() {
    const prefix = settings_api.get('resource_prefix') || 'converse.js';
    return `/${prefix}-${Math.floor(Math.random() * 139749528).toString()}`;
}

export function setStropheLogLevel() {
    const level = settings_api.get('loglevel');
    Strophe.setLogLevel(Strophe.LogLevel[level.toUpperCase()]);

    const lmap = {};
    lmap[Strophe.LogLevel.DEBUG] = 'debug';
    lmap[Strophe.LogLevel.INFO] = 'info';
    lmap[Strophe.LogLevel.WARN] = 'warn';
    lmap[Strophe.LogLevel.ERROR] = 'error';
    lmap[Strophe.LogLevel.FATAL] = 'fatal';

    Strophe.log = (l, msg) => log.log(msg, lmap[l]);
    Strophe.error = (msg) => log.error(msg);
}

export function getConnectionServiceURL() {
    if (('WebSocket' in globalThis || 'MozWebSocket' in globalThis) && settings_api.get('websocket_url')) {
        return settings_api.get('websocket_url');
    } else if (settings_api.get('bosh_service_url')) {
        return settings_api.get('bosh_service_url');
    }
    return '';
}

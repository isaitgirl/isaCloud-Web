/**
 * @description
 *  isaCloud: a test helper that drops the current connection on purpose, so
 *  that the diagnostics can be checked against a real disconnect. It is only
 *  offered when `isacloud_diagnostics_test` is on. It touches Strophe's
 *  internals (`_doDisconnect`) defensively, because it is a test helper and
 *  must never break a normal session when the transport changes upstream.
 *
 *  Nothing sensitive is recorded here: the event carries no reason text and
 *  the close reason is a fixed string.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api } from '@converse/headless';
import { record } from './recorder.js';
import { t } from './i18n.js';

/** The WebSocket close code for an application-specific close, as 4000 is. */
const TEST_CLOSE_CODE = 4000;

/** The reason sent to the server and shown in the diagnostics. */
const TEST_REASON = 'isacloud diagnostic test';

/**
 * Whether the connection-dropping test tools should be shown. They are off
 * everywhere except a local page, even if the setting is on, so a production
 * deployment can keep the setting without offering the button to users.
 * @returns {boolean}
 */
export function showTestTools() {
    if (!api.settings.get('isacloud_diagnostics_test')) return false;
    if (typeof location === 'undefined') return false;
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/**
 * Confirms with the user, then drops the connection for a few seconds. A
 * one-shot listener shows a toast once the session comes back.
 * @returns {Promise<void>}
 */
export async function forceConnectionFailure() {
    const confirmed = await api.confirm(
        t('Test connection'),
        t('This drops the connection for a few seconds. It is only a test; nothing is sent. Continue?'),
    );
    if (!confirmed) return;

    record('manual_test_started');

    const conn = api.connection.get();
    if (!conn) {
        api.toast.show('isacloud-diagnostics-test-not-connected', {
            type: 'info',
            body: t('Not connected'),
        });
        return;
    }

    let is_websocket = false;
    try {
        is_websocket = !!conn.isType?.('websocket');
    } catch {
        // A half torn-down transport is possible; fall back to the connection.
    }

    if (is_websocket) {
        const socket = conn._proto?.socket;
        if (typeof socket?.close === 'function') {
            socket.close(TEST_CLOSE_CODE, TEST_REASON);
        } else {
            conn._doDisconnect?.(TEST_REASON);
        }
    } else {
        conn._doDisconnect?.(TEST_REASON);
    }

    api.toast.show('isacloud-diagnostics-test-dropped', {
        type: 'info',
        body: t('Connection dropped for the test'),
    });

    const on_reconnected = () => {
        api.listen.not('reconnected', on_reconnected);
        api.toast.show('isacloud-diagnostics-test-back', {
            type: 'success',
            body: t('Connection is back'),
        });
    };
    api.listen.on('reconnected', on_reconnected);
}

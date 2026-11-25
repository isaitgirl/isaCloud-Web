import log from '@converse/log';
import sizzle from '#sizzle';
import _converse from '../_converse.js';
import { ANONYMOUS, BOSH_WAIT, LOGOUT } from '../../shared/constants.js';
import { CONNECTION_STATUS } from '../constants.js';
import { MemoryStorageBackend, Strophe } from 'strophe.js';
import { clearSession, tearDown } from '../../utils/session.js';
import { getOpenPromise } from '@converse/openpromise';
import { setUserJID } from '../../utils/init.js';
import { setLocalStorageItem } from '../../utils/environment.js';

const RETRY_BASE_DELAY = 3000;
const RETRY_MAX_DELAY = 60000;
// isaCloud: How long a fallback BOSH connection stays before the WebSocket is probed again, how far that delay grows
// when a return to the WebSocket fails, and how long a probe may take to open.
const WEBSOCKET_PROBE_DELAY = 5 * 60 * 1000;
const WEBSOCKET_PROBE_MAX_DELAY = 60 * 60 * 1000;
const WEBSOCKET_PROBE_TIMEOUT = 10000;

/**
 * Emits a structured diagnostic event, to be recorded by a listener of
 * `diagnosticEvent`. The payload must never contain message bodies, stanza
 * XML, contact JIDs, passwords, tokens or OMEMO keys.
 * @param {string} event
 * @param {object} [data]
 */
function emitDiagnostic(event, data = {}) {
    _converse.api.trigger('diagnosticEvent', { event, ...data });
}

/**
 * The transport methods that have already been wrapped, per transport, so
 * that wrapping again after a reconnection doesn't nest the wrappers.
 * @type {WeakMap<object, Set<string>>}
 */
const wrapped_transport_methods = new WeakMap();

/**
 * Wraps one method of a transport so that it reports a diagnostic event
 * before calling through. The original is always called with the original
 * `this` and arguments, and its return value is passed on.
 * @param {any} transport
 * @param {string} name
 * @param {string} event
 * @param {(...args: any[]) => object|undefined} get_data - Builds the payload
 *  from the call's arguments, or returns `undefined` to skip the event.
 */
function wrapTransportMethod(transport, name, event, get_data) {
    if (!transport || typeof transport[name] !== 'function') return;
    const wrapped = wrapped_transport_methods.get(transport) ?? new Set();
    if (wrapped.has(name)) return;
    wrapped.add(name);
    wrapped_transport_methods.set(transport, wrapped);

    const original = transport[name];
    const wrapper = function (...args) {
        try {
            const data = get_data(...args);
            if (data) emitDiagnostic(event, data);
        } catch (e) {
            log.debug(e);
        }
        return original.apply(this, args);
    };
    Object.defineProperty(transport, name, { 'configurable': true, 'writable': true, 'value': wrapper });
}

/**
 * The HTTP status of a BOSH request, whichever transport version is in use:
 * older ones pass it as an argument, newer ones report it on the request.
 * @param {any[]} args
 * @returns {number|undefined}
 */
function getBoshRequestStatus(args) {
    const status = args.find((arg) => typeof arg === 'number');
    if (status !== undefined) return status;
    const req = args.find((arg) => arg && typeof arg === 'object' && 'xhr' in arg);
    return req?.xhr?.status;
}

/**
 * The Connection class manages the connection to the XMPP server. It's
 * agnostic concerning the underlying protocol (i.e. websocket, long-polling
 * via BOSH or websocket inside a shared worker).
 */
export class Connection extends /** @type {import('../types').StropheConnectionConstructor} */ (Strophe.Connection) {
    // Set once this connection has been given up on. A later one replaces it.
    #finished = false;
    // How many retries have been scheduled since the connection last came up.
    #retries = 0;
    // How many attempts have failed, in a row, since the connection last came up.
    #transport_failures = 0;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #retry_timer = null;
    // When the scheduled retry is due, in milliseconds since the epoch.
    #retry_at = 0;
    // Set while a retry is getting ready to log in, before Strophe reports on it.
    #preparing_retry = false;
    // Set when the next attempt should use the other transport.
    #switch_transport = false;
    // isaCloud: Set once the current attempt has been counted as failed, since Strophe can report one failure more than once.
    #attempt_failed = false;
    // isaCloud: Set once a connection has come up over the WebSocket.
    #websocket_worked = false;
    // isaCloud: Set while the current BOSH connection is a fallback from a working WebSocket.
    #bosh_fallback = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #probe_timer = null;
    // isaCloud: How long to wait before probing the WebSocket again. Doubles when a return to it fails.
    #probe_delay = WEBSOCKET_PROBE_DELAY;
    // isaCloud: Set while a return to the WebSocket is underway, so that falling back again doubles the probe delay.
    #returning_to_websocket = false;

    /**
     * @param {string} service - The BOSH or WebSocket service URL.
     * @param {import('strophe.js').ConnectionOptions} options
     */
    constructor(service, options) {
        super(service, options);
        // For new sessions, we need to send out a presence stanza to notify
        // the server/network that we're online.
        // When re-attaching to an existing session we don't need to again send out a presence stanza,
        // because it's as if "we never left" (see onConnectStatusChanged).
        this.send_initial_presence = true;
        // Whether this connection has ever been established.
        this.has_connected = false;
        this.#wrapTransport();
    }

    /**
     * Reports what the transport itself sees, since Strophe's own log doesn't
     * reach `@converse/log`. Strophe replaces `_proto` when the transport is
     * switched or discovered, so this has to be re-run afterwards.
     */
    #wrapTransport() {
        const proto = this._proto;
        if (!proto) return;

        wrapTransportMethod(proto, '_onClose', 'transport_closed', (e) => ({
            'transport': 'websocket',
            'code': e?.code,
            'reason': e?.reason,
            'was_clean': e?.wasClean,
        }));
        wrapTransportMethod(proto, '_onError', 'transport_error', (e) => ({
            'transport': 'websocket',
            'type': e?.type,
        }));
        wrapTransportMethod(proto, '_onRequestError', 'transport_error', (_req, status) => ({
            'transport': 'bosh',
            status,
        }));
        // A BOSH request reports every readyState change; only a completed
        // request that failed says anything about the connection.
        wrapTransportMethod(proto, '_onRequestStateChange', 'transport_error', (...args) => {
            const req = args.find((arg) => arg && typeof arg === 'object' && 'xhr' in arg);
            if (req && req.xhr?.readyState !== 4) return;
            const status = getBoshRequestStatus(args);
            if (status !== 0 && !(status >= 400)) return;
            return { 'transport': 'bosh', status };
        });
    }

    /**
     * A snapshot of the reconnection state, for diagnostics.
     * @returns {{retries: number, retry_at: number, retry_scheduled: boolean}}
     */
    get retry_info() {
        return {
            'retries': this.#retries,
            'retry_at': this.#retry_at,
            'retry_scheduled': this.#retry_timer !== null,
        };
    }

    /**
     * Reconnects straight away after losing a working connection. After a
     * failed attempt it waits instead, because Strophe still has a disconnect
     * pending which would tear down an attempt that's started straight away.
     *
     * @param {object} [options]
     * @param {boolean} [options.explicit] - Whether this was asked for, rather
     *  than being the response to a failed attempt. It then doesn't interrupt
     *  an attempt that's underway, and doesn't wait out a long backoff.
     */
    requestReconnect({ explicit = false } = {}) {
        emitDiagnostic('reconnect_requested', { explicit });
        if (explicit && this.#isRetrying()) return;

        const wait =
            !!this.reconnecting ||
            this.status === Strophe.Status.CONNFAIL ||
            this.status === Strophe.Status.RECONNECTING;

        this.setConnectionStatus(Strophe.Status.RECONNECTING, 'The connection has dropped, attempting to reconnect.');
        if (!wait) return this.reconnect();
        return this.#scheduleReconnect(explicit ? RETRY_BASE_DELAY : RETRY_MAX_DELAY);
    }

    /**
     * Whether a retry has started and hasn't succeeded or failed yet.
     * @returns {boolean}
     */
    #isRetrying() {
        if (this.#preparing_retry) return true;
        if (!this.reconnecting) return false;
        return this.status === Strophe.Status.CONNECTING || this.status === Strophe.Status.AUTHENTICATING;
    }

    /**
     * Retries the connection after a delay, which doubles with each retry up
     * to {@link RETRY_MAX_DELAY}. While a retry is scheduled, further calls do
     * nothing, unless it's due later than `max_delay` from now, in which case
     * it's brought forward.
     * @param {number} [max_delay]
     */
    #scheduleReconnect(max_delay = RETRY_MAX_DELAY) {
        const is_scheduled = this.#retry_timer !== null;
        if (is_scheduled && this.#retry_at - Date.now() <= max_delay) return;

        this.#cancelScheduledReconnect();
        const delay = Math.min(RETRY_BASE_DELAY * 2 ** this.#retries, max_delay);
        if (!is_scheduled) this.#retries += 1;
        this.#retry_at = Date.now() + delay;
        this.#retry_timer = setTimeout(() => {
            this.#retry_timer = null;
            this.reconnect();
        }, delay);
        emitDiagnostic('reconnect_scheduled', { 'attempt': this.#retries, 'delay_ms': delay });
    }

    #cancelScheduledReconnect() {
        if (this.#retry_timer !== null) clearTimeout(this.#retry_timer);
        this.#retry_timer = null;
    }

    /**
     * isaCloud: Whether the connection is up over BOSH as a fallback from a working WebSocket.
     * @returns {boolean}
     */
    #isOnBoshFallback() {
        return !this.#finished && !!this.connected && !!this.isType('bosh') && this.#bosh_fallback;
    }

    /**
     * isaCloud: Probes the WebSocket after a while, so that a fallback BOSH connection goes back to it.
     */
    #scheduleWebSocketProbe() {
        this.#cancelWebSocketProbe();
        this.#probe_timer = setTimeout(() => this.#probeWebSocket(), this.#probe_delay);
    }

    #cancelWebSocketProbe() {
        if (this.#probe_timer !== null) clearTimeout(this.#probe_timer);
        this.#probe_timer = null;
    }

    /**
     * isaCloud: Opens a WebSocket to see whether it's reachable again. If it is, the BOSH session is ended and the
     * connection is made again over the WebSocket. If not, the probe is tried again later.
     */
    #probeWebSocket() {
        this.#probe_timer = null;
        const { api } = _converse;
        const url = api.settings.get('websocket_url');
        if (
            !this.#isOnBoshFallback() ||
            typeof WebSocket === 'undefined' ||
            !url ||
            api.settings.get('connection_options')?.worker
        ) {
            return;
        }

        let socket = null;
        let timeout = null;
        let done = false;
        const fail = () => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            socket?.close();
            emitDiagnostic('transport_probe', { 'ok': false });
            if (this.#isOnBoshFallback()) this.#scheduleWebSocketProbe();
        };
        try {
            socket = new WebSocket(url, 'xmpp');
        } catch (e) {
            log.debug(e);
            return fail();
        }
        timeout = setTimeout(fail, WEBSOCKET_PROBE_TIMEOUT);
        socket.onopen = () => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            socket?.close();
            emitDiagnostic('transport_probe', { 'ok': true });
            if (this.#isOnBoshFallback()) this.#returnToWebSocket();
        };
        socket.onerror = fail;
        socket.onclose = fail;
    }

    /**
     * isaCloud: Ends the BOSH session, so that the reconnection that follows uses the WebSocket.
     */
    #returnToWebSocket() {
        this.#returning_to_websocket = true;
        this.#switch_transport = true;
        emitDiagnostic('transport_return', { 'from': 'bosh', 'to': 'websocket' });
        this.disconnect('Switching back to WebSocket');
    }

    /** @param {Element} body */
    xmlInput(body) {
        log.debug('%c%s', 'color: darkgoldenrod', body.outerHTML);
    }

    /** @param {Element} body */
    xmlOutput(body) {
        log.debug('%c%s', 'color: darkcyan', body.outerHTML);
    }

    async bind() {
        const { api } = _converse;
        /**
         * Synchronous event triggered before we send an IQ to bind the user's
         * JID resource for this session.
         * @event _converse#beforeResourceBinding
         */
        await api.trigger('beforeResourceBinding', { 'synchronous': true });
        super.bind();
    }

    async onDomainDiscovered(response) {
        const { api } = _converse;
        const text = await response.text();
        const xrd = new DOMParser().parseFromString(text, 'text/xml').firstElementChild;
        if (xrd.nodeName != 'XRD' || xrd.namespaceURI != 'http://docs.oasis-open.org/ns/xri/xrd-1.0') {
            return log.info('Could not discover XEP-0156 connection methods');
        }
        const bosh_links = sizzle(`Link[rel="urn:xmpp:alt-connections:xbosh"]`, xrd);
        const ws_links = sizzle(`Link[rel="urn:xmpp:alt-connections:websocket"]`, xrd);
        const bosh_methods = bosh_links.map((el) => el.getAttribute('href')).filter((uri) => uri.startsWith('https:'));
        const ws_methods = ws_links.map((el) => el.getAttribute('href')).filter((uri) => uri.startsWith('wss:'));
        if (bosh_methods.length === 0 && ws_methods.length === 0) {
            log.info('Neither BOSH nor WebSocket connection methods have been specified with XEP-0156.');
        } else {
            // TODO: support multiple endpoints
            api.settings.set('websocket_url', ws_methods.pop());
            api.settings.set('bosh_service_url', bosh_methods.pop());
            this.service = api.settings.get('websocket_url') || api.settings.get('bosh_service_url');
            this.setProtocol();
            this.#wrapTransport();
        }
    }

    /**
     * Adds support for XEP-0156 by querying the XMPP server for alternate
     * connection methods. This allows users to use the websocket or BOSH
     * connection of their own XMPP server instead of a proxy provided by the
     * host of Converse.js.
     * @method Connection.discoverConnectionMethods
     * @param {string} domain
     */
    async discoverConnectionMethods(domain) {
        // Use XEP-0156 to check whether this host advertises websocket or BOSH connection methods.
        const options = {
            mode: /** @type {RequestMode} */ ('cors'),
            headers: {
                Accept: 'application/xrd+xml, text/xml',
            },
        };
        const url = `https://${domain}/.well-known/host-meta`;
        let response;
        try {
            response = await fetch(url, options);
        } catch (e) {
            log.info(`Failed to discover alternative connection methods at ${url}`);
            log.error(e);
            return;
        }
        if (response.status >= 200 && response.status < 400) {
            await this.onDomainDiscovered(response);
        } else {
            log.info('Could not discover XEP-0156 connection methods');
        }
    }

    /**
     * Establish a new XMPP session by logging in with the supplied JID and
     * password.
     * @param {String} jid
     * @param {String} password
     * @param {import('strophe.js').ConnectCallback} [callback]
     */
    async connect(jid, password, callback) {
        const { __, api } = _converse;

        if (api.settings.get('discover_connection_methods')) {
            const domain = Strophe.getDomainFromJid(jid);
            await this.discoverConnectionMethods(domain);
        }
        if (!api.settings.get('bosh_service_url') && !api.settings.get('websocket_url')) {
            // If we don't have a connection URL, we show an input for the user
            // to manually provide it.
            api.settings.set('show_connection_url_input', true);
            (callback || this.onConnectStatusChanged.bind(this))(
                Strophe.Status.DISCONNECTED,
                __('Could not automatically determine a connection URL'),
            );
            return;
        }
        super.connect(jid, password, callback || this.onConnectStatusChanged, BOSH_WAIT);
    }

    /**
     * @param {string} [reason]
     */
    disconnect(reason) {
        super.disconnect(reason);
        this.send_initial_presence = true;
    }

    /**
     * Switch to a different transport if a service URL is available for it.
     *
     * When reconnecting with a new transport, we call setUserJID
     * so that a new resource is generated, to avoid multiple
     * server-side sessions with the same resource.
     *
     * We also call `_proto._doDisconnect` so that connection event handlers
     * for the old transport are removed.
     */
    async switchTransport() {
        const { api } = _converse;
        this.#cancelWebSocketProbe(); // isaCloud: a probe belongs to the BOSH connection that is being left.

        const bare_jid = _converse.session.get('bare_jid');
        let from, to;
        if (api.connection.isType('websocket') && api.settings.get('bosh_service_url')) {
            from = 'websocket';
            to = 'bosh';
            await setUserJID(bare_jid);
            this._proto._doDisconnect();
            this._proto = new Strophe.Bosh(this);
            this.service = api.settings.get('bosh_service_url');
            // isaCloud: BOSH is only a fallback when the WebSocket has worked before.
            this.#bosh_fallback = this.#websocket_worked;
            if (this.#returning_to_websocket) {
                // isaCloud: The return to the WebSocket failed, so the next probe waits longer.
                this.#probe_delay = Math.min(this.#probe_delay * 2, WEBSOCKET_PROBE_MAX_DELAY);
                this.#returning_to_websocket = false;
            }
        } else if (api.connection.isType('bosh') && api.settings.get('websocket_url')) {
            from = 'bosh';
            to = 'websocket';
            if (api.settings.get('authentication') === ANONYMOUS) {
                // When reconnecting anonymously, we need to connect with only
                // the domain, not the full JID that we had in our previous
                // (now failed) session.
                await setUserJID(api.settings.get('jid'));
            } else {
                await setUserJID(bare_jid);
            }
            this._proto._doDisconnect();
            this._proto = new Strophe.Websocket(this);
            this.service = api.settings.get('websocket_url');
            this.#bosh_fallback = false;
        }
        this.#wrapTransport();
        if (to) emitDiagnostic('transport_switched', { from, to });
    }

    async reconnect() {
        this.#preparing_retry = true;
        try {
            return await this.#prepareAndLogIn();
        } finally {
            this.#preparing_retry = false;
        }
    }

    async #prepareAndLogIn() {
        const { api } = _converse;

        emitDiagnostic('reconnect_start', { 'attempt': this.#retries });
        log.debug('RECONNECTING: the connection has dropped, attempting to reconnect.');
        this.reconnecting = true;
        await tearDown(_converse);
        if (this.#finished) return;

        // isaCloud: A fallback BOSH connection that drops is most likely a short outage, so the first attempt tries the
        // WebSocket again instead of staying on BOSH. The drop itself can count as one failure (the server answers a
        // stale BOSH session with a terminate), hence `<= 1`.
        if (this.isType('bosh') && this.#bosh_fallback && this.#transport_failures <= 1) {
            this.#switch_transport = true;
        }

        const conn_status = _converse.state.connfeedback.get('connection_status');
        if (this.#switch_transport) {
            this.#switch_transport = false;
            await this.switchTransport();
        } else if (conn_status === Strophe.Status.AUTHFAIL && api.settings.get('authentication') === ANONYMOUS) {
            // When reconnecting anonymously, we need to connect with only
            // the domain, not the full JID that we had in our previous
            // (now failed) session.
            await setUserJID(api.settings.get('jid'));
        }
        if (this.#finished) return;

        /**
         * Triggered when the connection has dropped, but Converse will attempt
         * to reconnect again.
         * @event _converse#will-reconnect
         */
        api.trigger('will-reconnect');

        if (api.settings.get('authentication') === ANONYMOUS) {
            await clearSession(_converse);
            if (this.#finished) return;
        }
        const jid = _converse.session.get('jid');
        return api.user.login(jid);
    }

    /**
     * Called as soon as a new connection has been established, either
     * by logging in or by attaching to an existing BOSH session.
     * @method Connection.onConnected
     * @param {Boolean} [reconnecting] - Whether Converse.js reconnected from an earlier dropped session.
     */
    async onConnected(reconnecting) {
        const { api } = _converse;

        delete this.reconnecting;
        if (this.isType('bosh')) {
            // Solves problem of returned PubSub BOSH response not received by browser
            this.flush();
        }

        await setUserJID(this.jid);

        // Save the current JID in persistent storage so that we can attempt to
        // recreate the session from SCRAM keys
        if (_converse.state.config.get('trusted')) {
            const bare_jid = _converse.session.get('bare_jid');
            setLocalStorageItem('conversejs-session-jid', bare_jid);
        }

        /**
         * Synchronous event triggered after we've sent an IQ to bind the
         * user's JID resource for this session.
         * @event _converse#afterResourceBinding
         */
        await api.trigger('afterResourceBinding', reconnecting, { 'synchronous': true });

        if (reconnecting) {
            /**
             * After the connection has dropped and converse.js has reconnected.
             * Any Strophe stanza handlers (as registered via `converse.listen.stanza`) will
             * have to be registered anew.
             * @event _converse#reconnected
             * @example _converse.api.listen.on('reconnected', () => { ... });
             */
            api.trigger('reconnected');
        } else {
            /**
             * Triggered after the connection has been established and Converse
             * has got all its ducks in a row.
             * @event _converse#initialized
             */
            api.trigger('connected');
        }
    }

    /**
     * Used to keep track of why we got disconnected, so that we can
     * decide on what the next appropriate action is (in onDisconnected)
     * @param {Number|'logout'} [cause] - The status number as received from Strophe.
     * @param {String} [reason] - An optional user-facing message as to why
     *  there was a disconnection.
     * @param {Boolean} [override] - An optional flag to replace any previous
     *  disconnection cause and reason.
     */
    setDisconnectionCause(cause, reason, override) {
        if (cause === undefined) {
            delete this.disconnection_cause;
            delete this.disconnection_reason;
        } else if (this.disconnection_cause === undefined || override) {
            this.disconnection_cause = cause;
            this.disconnection_reason = reason;
        }
    }

    /**
     * @param {Number} [status] - The status number as received from Strophe.
     * @param {String} [message] - An optional user-facing message
     */
    setConnectionStatus(status, message) {
        this.status = status;
        _converse.state.connfeedback.set({ connection_status: status, message });
    }

    async finishDisconnection() {
        emitDiagnostic('finish_disconnection', {
            'cause': this.disconnection_cause,
            'reason': this.disconnection_reason,
        });
        this.#finished = true;
        this.#cancelScheduledReconnect();
        this.#cancelWebSocketProbe(); // isaCloud
        this.setConnectionStatus(Strophe.Status.DISCONNECTED, this.disconnection_reason);
        const { api } = _converse;
        // Properly tear down the session so that it's possible to manually connect again.
        log.debug('DISCONNECTED');
        delete this.reconnecting;
        this.reset();
        tearDown(_converse);
        await clearSession(_converse);
        api.connection.destroy();

        /**
         * Triggered after converse.js has disconnected from the XMPP server.
         * @event _converse#disconnected
         * @memberOf _converse
         * @example _converse.api.listen.on('disconnected', () => { ... });
         */
        api.trigger('disconnected');
    }

    /**
     * Whether to stop trying a connection that was never established, so that
     * for example a wrong address is reported instead of being retried forever.
     * One retry is still made after a failure, since it may use the other transport.
     * @returns {boolean}
     */
    #shouldGiveUp() {
        const { api } = _converse;
        if (this.has_connected || api.settings.get('retry_initial_connection')) return false;

        return this.status === Strophe.Status.CONNECTING || !!this.reconnecting;
    }

    /**
     * Whether the reason for this disconnection is one that retrying can't fix.
     * @returns {boolean}
     */
    #isUnrecoverable() {
        const reason = this.disconnection_reason;
        if (reason === 'remote-connection-failed') {
            // A gateway reports this while its XMPP server is down, which
            // `retry_initial_connection` is there to wait out.
            return this.has_connected || !_converse.api.settings.get('retry_initial_connection');
        }
        return (
            this.disconnection_cause === LOGOUT ||
            reason === Strophe.ErrorCondition.NO_AUTH_MECH ||
            reason === 'host-unknown' ||
            reason === 'not-well-formed'
        );
    }

    /**
     * Gets called once strophe's status reaches Strophe.Status.DISCONNECTED.
     * Will either start a teardown process for converse.js or attempt
     * to reconnect.
     * @method onDisconnected
     */
    onDisconnected() {
        // Strophe can report a failed attempt as disconnected more than once.
        if (this.#finished) return;
        this.#cancelWebSocketProbe(); // isaCloud

        const { api } = _converse;
        if (api.settings.get('auto_reconnect')) {
            if (this.disconnection_cause === Strophe.Status.AUTHFAIL) {
                if (api.settings.get('credentials_url') || api.settings.get('authentication') === ANONYMOUS) {
                    // If `credentials_url` is set, we reconnect, because we might
                    // be receiving expirable tokens from the credentials_url.
                    //
                    // If `authentication` is anonymous, we reconnect because we
                    // might have tried to attach with stale BOSH session tokens
                    // or with a cached JID and password
                    return this.requestReconnect();
                } else {
                    emitDiagnostic('give_up', { 'reason': 'authfail' });
                    return this.finishDisconnection();
                }
            } else if (this.#shouldGiveUp()) {
                const { __ } = _converse;
                this.setConnectionStatus(
                    Strophe.Status.CONNFAIL,
                    __('An error occurred while connecting to the chat server.'),
                );
                emitDiagnostic('give_up', { 'reason': 'initial_connection_failed' });
                return this.finishDisconnection();
            } else if (this.#isUnrecoverable()) {
                emitDiagnostic('give_up', {
                    'reason': 'unrecoverable:' + (this.disconnection_reason ?? this.disconnection_cause),
                });
                return this.finishDisconnection();
            }
            this.requestReconnect();
        } else {
            return this.finishDisconnection();
        }
    }

    /**
     * Callback method called by Strophe as the Connection goes
     * through various states while establishing or tearing down a
     * connection.
     * @param {Number} status
     * @param {String} [condition]
     */
    onConnectStatusChanged(status, condition) {
        const { __ } = _converse;
        emitDiagnostic('connection_status', {
            'status': CONNECTION_STATUS[status] ?? status,
            'status_code': status,
            condition,
        });
        log.debug(`Status changed to: ${CONNECTION_STATUS[status]}`);
        if (status === Strophe.Status.ATTACHFAIL) {
            this.setConnectionStatus(status);
            this.worker_attach_promise?.resolve(false);
        } else if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
            if (this.worker_attach_promise?.isResolved && this.status === Strophe.Status.ATTACHED) {
                // A different tab must have attached, so nothing to do for us here.
                return;
            }
            this.setConnectionStatus(status);
            this.worker_attach_promise?.resolve(true);

            this.setDisconnectionCause();
            if (this.restored) {
                // No need to send an initial presence stanza when
                // we're restoring an existing session (e.g. via SMACKS resume).
                this.send_initial_presence = false;
            }
            // A retry of a connection that never came up is still its first connection.
            const reconnected = this.reconnecting && this.has_connected;
            this.has_connected = true;
            this.#retries = 0;
            this.#transport_failures = 0;
            this.#attempt_failed = false; // isaCloud: the attempt that came up is no longer failed.
            this.#cancelScheduledReconnect();
            if (this.isType('websocket')) {
                // isaCloud: A WebSocket that comes up ends any return and resets the probe delay.
                this.#websocket_worked = true;
                this.#returning_to_websocket = false;
                this.#probe_delay = WEBSOCKET_PROBE_DELAY;
            } else if (this.isType('bosh') && this.#bosh_fallback) {
                this.#scheduleWebSocketProbe();
            }
            emitDiagnostic('connected', { reconnected, 'resumed': this.hasResumed() });
            if (reconnected) {
                log.debug(status === Strophe.Status.CONNECTED ? 'Reconnected' : 'Reattached');
                this.onConnected(true);
            } else {
                log.debug(status === Strophe.Status.CONNECTED ? 'Connected' : 'Attached');
                this.onConnected();
            }
        } else if (status === Strophe.Status.DISCONNECTED) {
            this.setDisconnectionCause(status, condition);
            this.onDisconnected();
        } else if (status === Strophe.Status.BINDREQUIRED) {
            this.bind();
        } else if (status === Strophe.Status.ERROR) {
            this.setConnectionStatus(status, __('An error occurred while connecting to the chat server.'));
        } else if (status === Strophe.Status.CONNECTING) {
            this.#attempt_failed = false; // isaCloud: a new attempt starts, so its failures count again.
            this.setConnectionStatus(status);
        } else if (status === Strophe.Status.AUTHENTICATING) {
            this.setConnectionStatus(status);
        } else if (status === Strophe.Status.AUTHFAIL) {
            if (!condition) {
                condition = __('Your XMPP address and/or password is incorrect. Please try again.');
            }
            this.setConnectionStatus(status, condition);
            this.setDisconnectionCause(status, condition, true);
            this.onDisconnected();
        } else if (status === Strophe.Status.CONNFAIL) {
            let feedback = condition;
            if (condition === 'host-unknown' || condition == 'remote-connection-failed') {
                feedback = __(
                    'We could not connect to %1$s, is your XMPP address correct?',
                    Strophe.getDomainFromJid(this.jid),
                );
            } else if (condition === 'policy-violation') {
                feedback = __('The XMPP server rejected the connection because of a policy violation');
            } else if (condition !== undefined && condition === Strophe?.ErrorCondition?.NO_AUTH_MECH) {
                feedback = __('The XMPP server did not offer a supported authentication mechanism');
            }
            this.setConnectionStatus(status, feedback);
            this.setDisconnectionCause(status, condition);

            // isaCloud: Strophe can report one failed attempt twice (error, then close 1006),
            // so the failure is only counted once per attempt.
            if (!this.#attempt_failed) {
                this.#attempt_failed = true;
                this.#transport_failures += 1;
                if (!this.has_connected) {
                    // A transport that never worked may simply be the wrong one.
                    this.#switch_transport = true;
                } else if (this.#transport_failures === 1) {
                    // A single failure after a working connection is often transient
                    // (e.g. the browser froze or the network changed), so the same
                    // transport is retried once before switching.
                    this.#switch_transport = false;
                    emitDiagnostic('transport_retry', {
                        'attempt': this.#transport_failures,
                        'transport': this.isType('bosh') ? 'bosh' : 'websocket',
                    });
                } else {
                    this.#switch_transport = true;
                }
            }
        } else if (status === Strophe.Status.DISCONNECTING) {
            this.setConnectionStatus(status);
            this.setDisconnectionCause(status, condition);
        }
    }

    /**
     * @param {string} type
     */
    isType(type) {
        if (type.toLowerCase() === 'websocket') {
            return this._proto instanceof Strophe.Websocket;
        } else if (type.toLowerCase() === 'bosh') {
            return Strophe.Bosh && this._proto instanceof Strophe.Bosh;
        }
    }

    hasResumed() {
        const { api } = _converse;
        if (api.settings.get('connection_options')?.worker || this.isType('bosh')) {
            return _converse.state.connfeedback.get('connection_status') === Strophe.Status.ATTACHED;
        }
        // Strophe knows whether its XEP-0198 engine resumed the session.
        return super.hasResumed();
    }

    restoreWorkerSession() {
        this.attach(this.onConnectStatusChanged);
        this.worker_attach_promise = getOpenPromise();
        return this.worker_attach_promise;
    }
}

/**
 * The MockConnection class is used during testing, to mock an XMPP connection.
 */
export class MockConnection extends Connection {
    /**
     * @param {string} service - The BOSH or WebSocket service URL.
     * @param {import('strophe.js').ConnectionOptions} options - The configuration options
     */
    constructor(service, options) {
        super(service, {
            ...options,
            // Tests must not leak resumable XEP-0198 state into each other
            // via sessionStorage, so default to in-memory storage. A test
            // can still supply its own (pre-seeded) backend via
            // connection_options.streamManagement.storage.
            streamManagement: { storage: new MemoryStorageBackend(), ...options.streamManagement },
        });

        this.sent_stanzas = [];
        this.IQ_stanzas = [];
        this.IQ_ids = [];

        this.features = Strophe.xmlHtmlNode(
            '<stream:features xmlns:stream="http://etherx.jabber.org/streams" xmlns="jabber:client">' +
                '<ver xmlns="urn:xmpp:features:rosterver"/>' +
                '<csi xmlns="urn:xmpp:csi:0"/>' +
                '<this xmlns="http://jabber.org/protocol/caps" ver="UwBpfJpEt3IoLYfWma/o/p3FFRo=" hash="sha-1" node="http://prosody.im"/>' +
                '<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">' +
                '<required/>' +
                '</bind>' +
                `<sm xmlns='urn:xmpp:sm:3'/>` +
                '<session xmlns="urn:ietf:params:xml:ns:xmpp-session">' +
                '<optional/>' +
                '</session>' +
                '</stream:features>',
        ).firstElementChild;

        // @ts-expect-error Only the BOSH transport has _processRequest, but the mock stubs it out regardless
        this._proto._processRequest = () => {};
        // Record the unavailable presence that a graceful disconnect sends,
        // as a real transport would put it on the wire.
        this._proto._disconnect = (pres) => {
            if (pres) this.sent_stanzas.push(pres);
            this._onDisconnectTimeout();
        };
        this._proto._onDisconnectTimeout = () => {};

        // Drain the send queue synchronously into sent_stanzas: this
        // captures everything Strophe queues in wire order (stanzas as
        // well as the XEP-0198 nonzas that the SM engine pushes directly
        // onto _data).
        this._proto._send = () => {
            while (this._data.length) {
                const el = this._data.shift();
                if (typeof el !== 'string') this.sent_stanzas.push(el);
            }
        };
        this._proto._connect = () => {
            this.connected = true;
            this.mock = true;
            this.jid = 'romeo@montague.lit/orchard';
            // Feed the mock stream features through the same post-SASL
            // decision point the real connect flow uses. With Stream
            // Management enabled this is where Strophe chooses between
            // <resume/> and resource binding; without it, it proceeds
            // straight to binding (BINDREQUIRED, since Converse uses
            // explicitResourceBinding).
            this._onStreamFeaturesAfterSASL(this.features);
        };
    }

    /**
     * Strophe's `Connection._dataRecv` unwraps an injected request into its
     * stanza element via the transport's `_reqToData`, but only for BOSH; on
     * websocket it expects the element directly. Tests inject a Request-shaped
     * object on both transports (see `createRequest`), so unwrap it here for
     * the websocket case before Strophe processes it.
     * @param {any} req
     * @param {string} [raw]
     */
    _dataRecv(req, raw) {
        const elem = this._proto instanceof Strophe.Bosh ? req : (req?.getResponse?.() ?? req);
        return super._dataRecv(elem, raw);
    }

    /** @returns {InstanceType<typeof import('strophe.js').Strophe.SASLSHA256>} */
    // @ts-expect-error Overrides the _sasl_mechanism property with a getter
    get _sasl_mechanism() {
        return new Strophe.SASLSHA256();
    }

    _processRequest() {
        // Don't attempt to send out stanzas
    }

    sendIQ(iq, callback, errback, timeout) {
        iq = iq.tree?.() ?? iq;

        this.IQ_stanzas.push(iq);
        const id = super.sendIQ(iq, callback, errback, timeout);
        this.IQ_ids.push(id);
        return id;
    }

    send(stanza) {
        stanza = stanza.tree?.() ?? stanza;
        // No sent_stanzas.push here: the stanza lands there via the
        // _proto._send drain (see constructor), like all outbound traffic.
        return super.send(stanza);
    }

    async bind() {
        const { api } = _converse;
        await api.trigger('beforeResourceBinding', { 'synchronous': true });
        this.authenticated = true;
        // The real bind-result handler calls this before emitting
        // CONNECTED; with SM enabled it sends the native <enable/>.
        this._onSessionReady();
        this._changeConnectStatus(Strophe.Status.CONNECTED);
    }
}

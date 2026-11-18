import _converse from '../../shared/_converse.js';
import api from '../../shared/api/index.js';
import converse from '../../shared/api/public.js';
import log from '@converse/log';
import { setLastStanzaDate } from './utils.js';

const { Strophe, u, stx } = converse.env;

/**
 * The local name of the first child of an `<error/>`, such as
 * `service-unavailable`. The stanza itself is never reported.
 * @param {Element} stanza
 * @returns {string|undefined}
 */
function getErrorCondition(stanza) {
    const error = Array.from(stanza?.children ?? []).find((el) => el.localName === 'error');
    const child = error?.firstElementChild;
    return child?.localName || child?.nodeName || undefined;
}

export default {
    /**
     * Pings the entity represented by the passed in JID by sending an IQ stanza to it.
     * @method api.ping
     * @param {string} [jid] - The JID of the service to ping
     *  If the ping is sent out to the user's bare JID and no response is received it will attempt to reconnect.
     * @param {number} [timeout] - The amount of time in
     *  milliseconds to wait for a response. The default is 10000;
     * @returns {Promise<boolean|null>}
     *  Whether the pinged entity responded with a non-error IQ stanza.
     *  If we already know we're not connected, no ping is sent out and `null` is returned.
     */
    async ping(jid, timeout) {
        if (!api.connection.authenticated()) {
            log.debug("Not pinging when we know we're not authenticated");
            return null;
        }

        // XXX: We could first check here if the server advertised that it supports PING.
        // However, some servers don't advertise while still responding to pings
        // const feature = _converse.disco_entities[_converse.domain].features.findWhere({'var': Strophe.NS.PING});
        setLastStanzaDate(new Date());
        const bare_jid = _converse.session.get('bare_jid');
        jid = jid || Strophe.getDomainFromJid(bare_jid);
        const iq = stx`
            <iq type="get"
                to="${jid}"
                id="${u.getUniqueId('ping')}"
                xmlns="jabber:client">
                <ping xmlns="${Strophe.NS.PING}"></ping>
            </iq>`;

        const result = await api.sendIQ(iq, timeout || 10000, false);
        if (result === null) {
            log.warn(`Timeout while pinging ${jid}`);
            if (jid === Strophe.getDomainFromJid(bare_jid)) {
                // Only a ping to our own domain says anything about the connection.
                api.trigger('diagnosticEvent', { 'event': 'ping_timeout', 'timeout_ms': timeout || 10000 });
                api.connection.reconnect();
            }
            return false;
        } else if (u.isErrorStanza(result)) {
            log.error(`Error while pinging ${jid}`);
            log.error(result);
            api.trigger('diagnosticEvent', { 'event': 'ping_error', 'condition': getErrorCondition(result) });
            return false;
        }
        return true;
    },
};

/**
 * @copyright The Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 * @description Converse.js plugin which adds support for XEP-0198: Stream Management.
 *
 * Stream Management itself (counters, the unacked queue, <enable/>/<resume/>
 * negotiation and stanza re-sending) is implemented natively by Strophe and
 * activated through the `enableStreamManagement` connection option, which
 * `api.connection.init` derives from the `enable_smacks` setting. This
 * plugin only registers the settings and re-emits Strophe's failure hook as
 * a Converse event.
 */
import api from '../../shared/api/index.js';
import converse from '../../shared/api/public.js';

const { Strophe } = converse.env;

Strophe.addNamespace('SM', 'urn:xmpp:sm:3');

/**
 * The local name of the first child of a `<failed/>` nonza, such as
 * `item-not-found`. Strophe hands the page adapter a `StanzaView` (whose
 * `serialized` is an XML string), but a DOM Element is accepted too. Returns
 * `undefined` when it can't be read, so that the caller can leave it out.
 * @param {any} el
 * @returns {string|undefined}
 */
function getFailedCondition(el) {
    try {
        let node = el;
        if (node && typeof node.serialized === 'string') {
            if (typeof DOMParser === 'undefined') return;
            node = new DOMParser().parseFromString(node.serialized, 'text/xml').documentElement;
        }
        if (!node || node.nodeType !== 1 || node.localName !== 'failed') return;
        const child = node.firstElementChild;
        return child?.localName || child?.nodeName || undefined;
    } catch {
        return;
    }
}

converse.plugins.add('converse-smacks', {
    initialize() {
        // Configuration values for this plugin
        // ====================================
        // Refer to docs/source/configuration.rst for explanations of these
        // configuration settings.
        api.settings.extend({
            enable_smacks: true,
            smacks_max_unacked_stanzas: 5,
        });

        api.listen.on('connectionInitialized', () => {
            const { sm } = api.connection.get();
            if (!sm) {
                return;
            }
            sm.onResumed = () => {
                /**
                 * Triggered when the previous XEP-0198 stream was resumed.
                 * Fires while the <resumed/> nonza is being processed
                 * (before the server's replay of queued stanzas is handled)
                 * so it can be used to register handlers for those stanzas
                 * (resource binding, and therefore `beforeResourceBinding`,
                 * is skipped on resumption).
                 * @event _converse#streamResumed
                 */
                api.trigger('streamResumed');
            };

            /**
             * @param {any} el - The `<failed/>` nonza, as a StanzaView or an Element.
             * @param {boolean} resume_failed
             */
            sm.onFailed = (el, resume_failed) => {
                if (resume_failed) {
                    const condition = getFailedCondition(el);
                    /**
                     * Triggered when the XEP-0198 stream could not be resumed.
                     * @event _converse#streamResumptionFailed
                     * @param {object} data
                     * @param {string} [data.condition] - The local name of the
                     *  first child of the `<failed/>` nonza, e.g. `item-not-found`.
                     */
                    api.trigger('streamResumptionFailed', condition ? { condition } : {});
                }
            };
        });
    },
});

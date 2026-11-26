/**
 * @description
 *  isaCloud: create groups and channels on the account's own MUC service.
 *
 *  The fork is shared by more than one domain, and each one runs its own MUC
 *  component. Discovery alone is not enough: the first service advertised by
 *  the server is not necessarily the one the account should use, so this
 *  plugin maps the account's domain to its MUC service. New groups and
 *  channels then land on the right component, while accounts on external
 *  servers keep the usual discovery. A configured `muc_domain` still wins.
 *
 *  The mapping is exposed as the `isacloud_muc_service_by_domain` setting, so a
 *  page can override only the domains it cares about.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, converse } from '@converse/headless';

const { Strophe } = converse.env;

converse.plugins.add('converse-isacloud-muc-service', {
    initialize() {
        api.settings.extend(
            {
                /** MUC service used for each account domain. Unlisted domains fall back to discovery. */
                isacloud_muc_service_by_domain: {
                    'isacloud.im': 'conference.isacloud.cc',
                    'voz.social.br': 'canais.voz.social.br',
                    'xmpp.social.br': 'canais.xmpp.social.br',
                },
            },
            { deep_merge: ['isacloud_muc_service_by_domain'] },
        );

        api.listen.on('getDefaultMUCService', (_context, data) => {
            const bare_jid = _converse.session.get('bare_jid');
            if (!bare_jid) return data;

            const domain = Strophe.getDomainFromJid(bare_jid).trim().toLowerCase();
            const service = api.settings.get('isacloud_muc_service_by_domain')?.[domain];
            return service ? { ...data, jid: service } : data;
        });
    },
});

/**
 * @copyright The Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 * @module plugins-omemo-index
 */
import { _converse, api, converse, log } from '@converse/headless';
import { html } from 'lit';
import './fingerprints.js';
import './profile.js';
import 'shared/modals/user-details.js';
import { addSendErrorMessages } from 'shared/chat/send-errors.js';
import {
    generateFingerprints,
    getOMEMOSendErrorMessages,
    getOMEMOToolbarButton,
    handleEncryptedFiles,
    onChatComponentInitialized,
} from './utils.js';

import UndecryptableAlert from './undecryptable-alert.js';

import './styles/omemo.scss';

// Among the composer panels, smallest at the top. Below the time warning.
const UNDECRYPTABLE_ALERT_ORDER = 110;

converse.plugins.add('converse-omemo-views', {
    /**
     * @param {import('@converse/headless').ConversePrivateGlobal} _converse
     */
    enabled(_converse) {
        return _converse.pluggable.plugins['converse-omemo']?.enabled(_converse);
    },

    dependencies: ['converse-chatview', 'converse-omemo'],

    initialize() {
        api.listen.on('chatBoxViewInitialized', onChatComponentInitialized);
        api.listen.on('chatRoomViewInitialized', onChatComponentInitialized);
        api.listen.on('getToolbarButtons', getOMEMOToolbarButton);
        api.listen.on('afterMessageBodyTransformed', handleEncryptedFiles);
        addSendErrorMessages(getOMEMOSendErrorMessages);

        api.listen.on('userDetailsModalInitialized', (contact) => {
            const jid = contact.get('jid');
            generateFingerprints(jid).catch((e) => log.error(e));
        });

        api.listen.on('profileModalInitialized', () => {
            const bare_jid = _converse.session.get('bare_jid');
            generateFingerprints(bare_jid).catch((e) => log.error(e));
        });

        // Defined here rather than at module level, so that blacklisting this
        // plugin also leaves the element undefined and the panel unmounted.
        api.elements.define('converse-omemo-undecryptable-alert', UndecryptableAlert);
        api.listen.on('getComposerPanels', (container, panels) => {
            panels.push({
                name: 'omemo-undecryptable-alert',
                order: UNDECRYPTABLE_ALERT_ORDER,
                template: html`<converse-omemo-undecryptable-alert
                    .model=${container.model}
                ></converse-omemo-undecryptable-alert>`,
            });
            return panels;
        });
    },
});

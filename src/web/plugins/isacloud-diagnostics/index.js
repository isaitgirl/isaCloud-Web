/**
 * @description
 *  isaCloud: connection diagnostics. A small, independent log of connection
 *  events (drops, reconnects, transport closes, page and network changes)
 *  recorded without any message content, kept for 24 hours and sent to the
 *  report address as an OMEMO-encrypted file. The entry points are Settings →
 *  About and a discreet footer link on the login screen, which opens the same
 *  dialog and always allows the file to be downloaded.
 *
 *  The store, the recorder and the report file live in their own modules
 *  (`store.js`, `recorder.js`, `report.js`); this plugin only wires them to the
 *  UI, so nothing is sent automatically or in the clear.
 *
 *  See isacloud-docs analysis 2026-11-18-logs-diagnostico (private docs repo).
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { _converse, api, converse } from '@converse/headless';
import { clear, getEntries, getSummary, ready, record, start } from './recorder.js';
import { buildReport, createReportFile, downloadReport } from './report.js';
import { downloadReportFile, sendReport } from './send.js';
import { forceConnectionFailure } from './force-failure.js';
import DiagnosticsSection from './element.js';
import DiagnosticsModal from './modal.js';
import './styles/diagnostics.scss';

converse.plugins.add('converse-isacloud-diagnostics', {
    dependencies: ['converse-controlbox', 'converse-profile'],

    initialize() {
        api.settings.extend({
            /** Whether the diagnostics section, the footer link and the recorder are on. */
            isacloud_diagnostics: true,
            /** How many hours of entries the store keeps. */
            isacloud_diagnostics_hours: 24,
            /** Safety ceiling, so a reconnect loop cannot fill the store. */
            isacloud_diagnostics_max_entries: 5000,
            /** Where the report is sent; the account should have an OMEMO device. */
            isacloud_diagnostics_report_jid: 'reports@isacloud.im',
            /** Shows the test button that drops the connection, in Settings → About. */
            isacloud_diagnostics_test: false,
        });

        start();

        api.listen.on('isacloudDiagnosticsRequested', () => api.modal.show('converse-isacloud-diagnostics-modal'));

        api.elements.define('converse-isacloud-diagnostics', DiagnosticsSection);
        api.elements.define('converse-isacloud-diagnostics-modal', DiagnosticsModal);

        // Shared with the specs, which need the same module state as the plugin.
        _converse.exports.isacloud_diagnostics = {
            ready,
            start,
            record,
            getEntries,
            getSummary,
            clear,
            createReportFile,
            buildReport,
            downloadReport,
            downloadReportFile,
            sendReport,
            forceConnectionFailure,
        };
    },
});

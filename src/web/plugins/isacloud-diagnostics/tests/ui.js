import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-diagnostics'],
    isacloud_diagnostics: true,
    isacloud_diagnostics_report_jid: 'reports@isacloud.im',
    isacloud_diagnostics_test: true,
    view_mode: 'fullscreen',
};

const LOGGED_OUT = { ...SETTINGS, auto_login: false };

describe('isaCloud connection diagnostics', function () {
    it(
        'renders the section in Settings → About and opens the modal',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            await mock.openControlBox(_converse);

            const modal = await _converse.api.modal.show('converse-user-settings-modal');
            const section = await u.waitUntil(() => modal.querySelector('converse-isacloud-diagnostics'));
            const title = await u.waitUntil(() => section.querySelector('.isacloud-diagnostics__title'));
            expect(title.textContent.trim()).toBe('Connection diagnostics');

            const summary = await u.waitUntil(() => section.querySelector('.isacloud-diagnostics__summary'));
            expect(summary.textContent).toContain('Last 24 h');
            expect(summary.textContent).toContain('disconnects');
            expect(summary.textContent).toContain('reconnects');

            const open = section.querySelector('.isacloud-diagnostics__open');
            expect(open.textContent.trim()).toBe('Send diagnostics');
            open.click();

            const diagnostics = await u.waitUntil(() => _converse.api.modal.get('converse-isacloud-diagnostics-modal'));
            await u.waitUntil(() => u.isVisible(diagnostics));
            expect(diagnostics.querySelector('.modal-title').textContent.trim()).toBe('Connection diagnostics');
        }),
    );

    it(
        'shows a footer link on the login screen that asks for the modal',
        mock.initConverse(converse, ['chatBoxesInitialized'], LOGGED_OUT, async function (_converse) {
            const link = await u.waitUntil(() =>
                document.querySelector('converse-footer .isacloud-footer-diagnostics'),
            );
            expect(link.getAttribute('role')).toBe('button');
            expect(link.getAttribute('title')).toBe('Diagnóstico de conexão');

            const trigger = vi.spyOn(_converse.api, 'trigger');
            link.click();
            expect(trigger).toHaveBeenCalledWith('isacloudDiagnosticsRequested');

            const modal = await u.waitUntil(() => _converse.api.modal.get('converse-isacloud-diagnostics-modal'));
            await u.waitUntil(() => u.isVisible(modal));
        }),
    );

    it(
        'hides the footer link when the diagnostics are turned off',
        mock.initConverse(
            converse,
            ['chatBoxesInitialized'],
            { ...LOGGED_OUT, isacloud_diagnostics: false },
            async function () {
                const footer = await u.waitUntil(() => document.querySelector('converse-footer'));
                expect(footer.querySelector('.isacloud-footer-diagnostics')).toBeNull();
            },
        ),
    );

    it(
        'disables Send without a connection and keeps Download available',
        mock.initConverse(converse, ['chatBoxesInitialized'], LOGGED_OUT, async function (_converse) {
            await u.waitUntil(() => document.querySelector('#converse-modals'));
            _converse.api.modal.remove('converse-isacloud-diagnostics-modal');
            _converse.api.trigger('isacloudDiagnosticsRequested');
            const modal = await u.waitUntil(() => _converse.api.modal.get('converse-isacloud-diagnostics-modal'));
            await u.waitUntil(() => u.isVisible(modal));

            const send = await u.waitUntil(() => modal.querySelector('.isacloud-diagnostics-modal__send'));
            const download = modal.querySelector('.isacloud-diagnostics-modal__download');
            await u.waitUntil(() => send.disabled);

            expect(send.disabled).toBe(true);
            expect(download.disabled).toBe(false);
            expect(modal.textContent).toContain('Not connected');
        }),
    );

    it(
        'does not try to upload when there is no connection',
        mock.initConverse(converse, ['chatBoxesInitialized'], LOGGED_OUT, async function (_converse) {
            const { sendReport } = _converse.exports.isacloud_diagnostics;
            const get_chat = vi.spyOn(_converse.api.chats, 'get');

            await expect(sendReport()).rejects.toMatchObject({ code: 'not-connected' });
            expect(get_chat).not.toHaveBeenCalled();
        }),
    );

    it(
        'does not upload when the report chat has no OMEMO support',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { sendReport } = _converse.exports.isacloud_diagnostics;
            vi.spyOn(_converse.api.connection, 'authenticated').mockReturnValue(true);

            const chat = {
                get: vi.fn((key) => (key === 'omemo_supported' ? false : undefined)),
                save: vi.fn(),
                sendFiles: vi.fn(),
            };
            vi.spyOn(_converse.api.chats, 'get').mockResolvedValue(chat);

            await expect(sendReport()).rejects.toMatchObject({ code: 'omemo-unsupported' });
            expect(chat.save).not.toHaveBeenCalled();
            expect(chat.sendFiles).not.toHaveBeenCalled();
        }),
    );

    it(
        'uses the test recipient override when one is supplied',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { sendReport } = _converse.exports.isacloud_diagnostics;
            vi.spyOn(_converse.api.connection, 'authenticated').mockReturnValue(true);
            const toast = vi.spyOn(_converse.api.toast, 'show');

            const chat = {
                get: vi.fn((key) => (key === 'omemo_supported' ? true : undefined)),
                save: vi.fn(),
                sendFiles: vi.fn(async () => [{ get: (key) => (key === 'upload' ? 'success' : undefined) }]),
            };
            const get_chat = vi.spyOn(_converse.api.chats, 'get').mockResolvedValue(chat);

            await sendReport({ note: 'teste', recipient: 'diagnostico@example.org' });

            expect(get_chat).toHaveBeenCalledWith('diagnostico@example.org', {}, true);
            expect(chat.save).toHaveBeenCalledWith({ omemo_active: true });
            expect(chat.sendFiles).toHaveBeenCalledOnce();
            expect(toast).toHaveBeenCalledWith(
                'isacloud-diagnostics-report-sent',
                expect.objectContaining({ type: 'success' }),
            );
        }),
    );

    it(
        'drops the connection through the transport for the test',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { forceConnectionFailure } = _converse.exports.isacloud_diagnostics;
            vi.spyOn(_converse.api, 'confirm').mockResolvedValue([]);

            await mock.openControlBox(_converse);
            const conn = _converse.api.connection.get();
            vi.spyOn(conn, 'isType').mockReturnValue(false);
            const do_disconnect = vi.spyOn(conn, '_doDisconnect').mockImplementation(() => {});
            const toast = vi.spyOn(_converse.api.toast, 'show');

            await forceConnectionFailure();

            expect(do_disconnect).toHaveBeenCalledWith('isacloud diagnostic test');
            expect(toast).toHaveBeenCalledWith(
                'isacloud-diagnostics-test-dropped',
                expect.objectContaining({ type: 'info', body: 'Connection dropped for the test' }),
            );

            await _converse.api.trigger('reconnected');
            expect(toast).toHaveBeenCalledWith(
                'isacloud-diagnostics-test-back',
                expect.objectContaining({ type: 'success', body: 'Connection is back' }),
            );
        }),
    );

    it(
        'closes the websocket for the test when connected over websocket',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const { forceConnectionFailure } = _converse.exports.isacloud_diagnostics;
            vi.spyOn(_converse.api, 'confirm').mockResolvedValue([]);

            await mock.openControlBox(_converse);
            const conn = _converse.api.connection.get();
            const socket = { close: vi.fn() };
            conn._proto.socket = socket;
            vi.spyOn(conn, 'isType').mockReturnValue(true);

            try {
                await forceConnectionFailure();
                expect(socket.close).toHaveBeenCalledWith(4000, 'isacloud diagnostic test');
            } finally {
                delete conn._proto.socket;
                await _converse.api.trigger('reconnected');
            }
        }),
    );
});

import mock from '../../../tests/mock.js';
import converse from '../../../dist/converse-headless.js';

const { Strophe } = converse.env;

/**
 * The ping plugin listens to `visibilitychange` on the document. Dispatching
 * the event exercises the real listener, as the browser would.
 */
function showPage() {
    document.dispatchEvent(new Event('visibilitychange'));
}

describe('Returning to a visible tab', function () {
    it(
        'reconnects straight away when a session that was up is no longer authenticated',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const { api } = _converse;
            const connection = api.connection.get();
            connection.has_connected = true;
            vi.spyOn(api.connection, 'authenticated').mockReturnValue(false);
            const reconnect = vi.spyOn(api.connection, 'reconnect').mockImplementation(() => {});
            const ping = vi.spyOn(api, 'ping');

            showPage();

            expect(reconnect).toHaveBeenCalledOnce();
            expect(ping).not.toHaveBeenCalled();
        }),
    );

    it(
        'only pings a healthy connection, with a short timeout',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const { api } = _converse;
            api.connection.get().has_connected = true;
            vi.spyOn(api.connection, 'authenticated').mockReturnValue(true);
            const reconnect = vi.spyOn(api.connection, 'reconnect').mockImplementation(() => {});
            const ping = vi.spyOn(api, 'ping');

            showPage();

            expect(ping).toHaveBeenCalledOnce();
            expect(ping).toHaveBeenCalledWith(null, 1500);
            expect(reconnect).not.toHaveBeenCalled();
        }),
    );

    it(
        'gives up on a silent connection after 1.5s instead of 5s',
        mock.initConverse(converse, [], {}, async (_converse) => {
            const { api } = _converse;
            api.connection.get().has_connected = true;
            vi.spyOn(api.connection, 'authenticated').mockReturnValue(true);
            const reconnect = vi.spyOn(api.connection, 'reconnect').mockImplementation(() => {});

            // Strophe's timed handlers read the clock, so `Date` is faked too.
            // The idle loop was armed under the real clock, so restart it on
            // the fake one, as Strophe does after a stream restart.
            vi.useFakeTimers();
            try {
                api.connection.get()._scheduleIdle();
                showPage();
                // The ping went out, no answer comes back.
                const ping = api.connection
                    .get()
                    .IQ_stanzas.some((iq) => iq.getElementsByTagNameNS(Strophe.NS.PING, 'ping').length);
                expect(ping).toBe(true);

                await vi.advanceTimersByTimeAsync(1499);
                expect(reconnect).not.toHaveBeenCalled();
                await vi.advanceTimersByTimeAsync(1);
                expect(reconnect).toHaveBeenCalledOnce();
            } finally {
                vi.useRealTimers();
            }
        }),
    );
});

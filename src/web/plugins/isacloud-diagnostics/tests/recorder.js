import { api } from '@converse/headless';
import * as recorder from '../recorder.js';

describe('The isaCloud diagnostics recorder', function () {
    beforeEach(async () => {
        await recorder._resetForTests();
        await recorder.start();
    });

    afterEach(async () => {
        vi.useRealTimers();
        await recorder._resetForTests();
    });

    it('records app_start and a context snapshot on every entry', function () {
        recorder.record('probe', { a: 1 });
        const entry = recorder.getEntries().at(-1);

        expect(entry.ev).toBe('probe');
        expect(entry.a).toBe(1);
        expect(typeof entry.ts).toBe('string');
        expect(typeof entry.mono).toBe('number');
        expect('status' in entry.ctx).toBe(true);
        expect(entry.ctx.visible).toBe(document.visibilityState);
        expect(entry.ctx.online).toBe(navigator.onLine);

        const app_start = recorder.getEntries().find((e) => e.ev === 'app_start');
        expect(app_start).toBeTruthy();
        expect(typeof app_start.user_agent).toBe('string');
        expect(typeof app_start.session_cookie).toBe('boolean');
        expect(typeof app_start.pwa).toBe('boolean');
        expect(typeof app_start.unclean_start).toBe('boolean');
    });

    it('drops DOM nodes, errors, functions, sensitive keys and long strings', function () {
        const element = document.createElement('div');
        const error = new Error('boom');

        recorder.record('secret', {
            element,
            error,
            fn: () => {},
            missing: undefined,
            body: 'segredo',
            from: 'juliet@capulet.lit',
            long: 'a'.repeat(900),
            ok: true,
            count: 2,
            nil: null,
            list: ['x', element, 3],
            nested: { a: 1, element, b: 'b'.repeat(900) },
        });

        const entry = recorder.getEntries().at(-1);
        expect(entry.element).toBeUndefined();
        expect(entry.error).toBeUndefined();
        expect(entry.fn).toBeUndefined();
        expect(entry.missing).toBeUndefined();
        expect(entry.body).toBeUndefined();
        expect(entry.from).toBeUndefined();
        expect(entry.long).toHaveLength(500);
        expect(entry.ok).toBe(true);
        expect(entry.count).toBe(2);
        expect(entry.nil).toBeNull();
        expect(entry.list).toEqual(['x', 3]);
        expect(entry.nested).toEqual({ a: 1, b: 'b'.repeat(500) });
    });

    it('counts disconnects and reconnects in the summary', function () {
        recorder.record('connection_status', { status: 'DISCONNECTED', status_code: 6 });
        const disconnected_at = recorder.getEntries().at(-1).ts;
        recorder.record('connected', { reconnected: true, resumed: false });
        const reconnected_at = recorder.getEntries().at(-1).ts;

        const summary = recorder.getSummary();
        expect(summary.disconnects).toBe(1);
        expect(summary.reconnects).toBe(1);
        expect(summary.last_disconnect_at).toBe(disconnected_at);
        expect(summary.last_reconnect_at).toBe(reconnected_at);
        expect(summary.total).toBeGreaterThanOrEqual(2);
    });

    it('keeps only the newest entries up to the configured cap', async function () {
        vi.spyOn(api.settings, 'get').mockImplementation((key) =>
            key === 'isacloud_diagnostics_max_entries' ? 3 : undefined,
        );
        await recorder._resetForTests();
        await recorder.start();

        for (let i = 0; i < 5; i += 1) recorder.record(`probe${i}`);

        expect(recorder.getEntries().map((entry) => entry.ev)).toEqual(['probe2', 'probe3', 'probe4']);
    });

    it('drops entries outside the retention window', async function () {
        await recorder._resetForTests();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        await recorder.start();
        recorder.record('old');
        expect(recorder.getEntries().map((entry) => entry.ev)).toContain('old');

        vi.setSystemTime(new Date('2026-01-02T01:00:00.000Z'));

        expect(recorder.getEntries()).toEqual([]);
    });

    it('clears the buffer and the store', async function () {
        recorder.record('probe');
        expect(recorder.getEntries().length).toBeGreaterThan(0);

        await recorder.clear();

        expect(recorder.getEntries()).toEqual([]);
    });

    it('nothing is recorded while diagnostics are disabled', async function () {
        vi.spyOn(api.settings, 'get').mockImplementation((key) => (key === 'isacloud_diagnostics' ? false : undefined));
        const before = recorder.getEntries().length;
        recorder.record('probe');
        expect(recorder.getEntries().length).toBe(before);
    });
});

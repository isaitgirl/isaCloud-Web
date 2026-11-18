import * as store from '../store.js';

const iso = (ms) => new Date(ms).toISOString();

describe('The isaCloud diagnostics store', function () {
    beforeEach(async () => {
        await store._resetForTests();
    });

    afterEach(async () => {
        await store.clearAll();
    });

    it('is available in the browser test project', function () {
        expect(store.isAvailable()).toBe(true);
    });

    it('appends entries and reads them since a cutoff, oldest first', async function () {
        const now = Date.now();
        await store.append({ ts: iso(now - 1000), ev: 'newer', n: 2 });
        await store.append({ ts: iso(now - 3000), ev: 'older', n: 1 });
        await store.append({ ts: iso(now - 2000), ev: 'middle', n: 3 });

        const all = await store.readSince(0);
        expect(all.map((entry) => entry.ev)).toEqual(['older', 'middle', 'newer']);

        const recent = await store.readSince(now - 2500);
        expect(recent.map((entry) => entry.ev)).toEqual(['middle', 'newer']);
    });

    it('prunes entries older than the cutoff', async function () {
        const now = Date.now();
        await store.append({ ts: iso(now - 10_000), ev: 'old' });
        await store.append({ ts: iso(now - 1_000), ev: 'new' });

        await store.prune(now - 5_000);

        const entries = await store.readSince(0);
        expect(entries.map((entry) => entry.ev)).toEqual(['new']);
    });

    it('clears the entries but keeps the meta values', async function () {
        await store.setMeta('last_clean', '2026-11-18T00:00:00.000Z');
        await store.append({ ts: iso(Date.now()), ev: 'probe' });
        expect((await store.readSince(0)).length).toBe(1);

        await store.clearAll();

        expect(await store.readSince(0)).toEqual([]);
        expect(await store.getMeta('last_clean')).toBe('2026-11-18T00:00:00.000Z');
    });

    it('stores and reads meta values', async function () {
        expect(await store.getMeta('last_alive')).toBeUndefined();
        await store.setMeta('last_alive', '2026-11-18T12:00:00.000Z');
        expect(await store.getMeta('last_alive')).toBe('2026-11-18T12:00:00.000Z');
    });

    it('normalizes a numeric timestamp into an ISO string', async function () {
        const ts = Date.now() - 500;
        await store.append({ ts, ev: 'numeric' });
        const [entry] = await store.readSince(0);
        expect(entry.ts).toBe(iso(ts));
    });
});

import { _converse, converse } from '@converse/headless';
import * as recorder from '../recorder.js';
import { buildReport, createReportFile, downloadReport } from '../report.js';

const OWN_BARE_JID = 'romeo@montague.lit';
const OWN_RESOURCE = 'isaCloudWeb-test';

describe('The isaCloud diagnostics report', function () {
    beforeEach(async () => {
        await recorder._resetForTests();
        _converse.session.set({ bare_jid: OWN_BARE_JID, resource: OWN_RESOURCE });
        await recorder.start();
    });

    afterEach(async () => {
        await recorder._resetForTests();
    });

    it('creates a JSON file with a portable timestamped name', async function () {
        const file = await createReportFile('minha nota');

        expect(file.name).toMatch(/^isacloud-web-v\d+\.\d+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
        expect(file.type).toBe('application/json');
    });

    it('includes the own JID and resource but no contact JIDs or message bodies', async function () {
        recorder.record('probe', {
            from: 'juliet@capulet.lit',
            to: 'juliet@capulet.lit/orchard',
            body: 'segredo',
        });

        const report = await buildReport('sem rede');

        expect(report.meta.account).toBe(OWN_BARE_JID);
        expect(report.meta.resource).toBe(OWN_RESOURCE);
        expect(report.meta.release).toBe(converse.env.VERSION_NAME);
        expect(report.meta.note).toBe('sem rede');
        expect(report.meta.summary.disconnects).toBe(0);
        expect(report.meta.generated_at).toEqual(expect.any(String));

        const json = JSON.stringify(report);
        expect(json).not.toContain('juliet');
        expect(json).not.toContain('segredo');
        expect(report.meta.account).not.toBeUndefined();
    });

    it('drops the oldest entries when the report would exceed about 1 MB', async function () {
        const payload = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, 'x'.repeat(500)]));
        for (let i = 0; i < 250; i += 1) recorder.record('big', payload);

        const report = await buildReport();
        const size = JSON.stringify(report, null, 2).length;

        expect(report.entries.length).toBeLessThan(251);
        expect(report.entries.length).toBeGreaterThanOrEqual(100);
        expect(size).toBeLessThanOrEqual(1_000_000);
    });

    it('downloads through a Blob URL and an anchor, without a connection', async function () {
        const create_object_url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:isacloud-diagnostics');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        /** @type {HTMLAnchorElement|null} */
        let clicked = null;
        const click = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function () {
            clicked = this;
        });

        const file = await downloadReport('nota');

        expect(click).toHaveBeenCalledOnce();
        expect(create_object_url).toHaveBeenCalledOnce();
        expect(file).toBeInstanceOf(File);
        expect(clicked?.download).toBe(file.name);
        expect(clicked?.href).toContain('blob:isacloud-diagnostics');
        expect(document.querySelector('a[download]')).toBeNull();
        expect(revoke).not.toHaveBeenCalled();
    });
});

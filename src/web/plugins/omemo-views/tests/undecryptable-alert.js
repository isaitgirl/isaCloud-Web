import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { Strophe, u } = converse.env;

/**
 * An OMEMO2 message with a <key> for some other device of ours (rid 999999),
 * so it can't be decrypted on this device. Archived ones are wrapped the way
 * MAM delivers them, from our own account.
 * @param {any} _converse
 * @param {{ from: string, type?: string, id: string, archived?: boolean, archive_id?: string }} options
 */
function undecryptableStanza(_converse, { from, type = 'chat', id, archived = false, archive_id = 'archive-1' }) {
    const conn = _converse.api.connection.get();
    const encrypted = `<encrypted xmlns="${Strophe.NS.OMEMO2}">
            <header sid="555">
                <keys jid="${_converse.bare_jid}">
                    <key rid="999999">${btoa('not-for-this-device')}</key>
                </keys>
            </header>
            <payload>${btoa('irrelevant')}</payload>
        </encrypted>
        <encryption xmlns="${Strophe.NS.EME}" namespace="${Strophe.NS.OMEMO2}"/>`;
    const inner = `<message from="${from}" to="${conn.jid}" type="${type}" id="${id}" xmlns="jabber:client">${encrypted}</message>`;
    const xml = archived
        ? `<message from="${_converse.bare_jid}" to="${conn.jid}" xmlns="jabber:client">
            <result xmlns="${Strophe.NS.MAM}" id="${archive_id}">
                <forwarded xmlns="urn:xmpp:forward:0">${inner}</forwarded>
            </result>
        </message>`
        : inner;
    // Strip the whitespace between tags, which stx would not have left in.
    return new DOMParser().parseFromString(xml.replace(/>\s+</g, '><'), 'application/xml').documentElement;
}

/**
 * @param {any} _converse
 * @param {string} contact_jid
 */
async function openChatWithOMEMO(_converse, contact_jid) {
    await mock.waitForRoster(_converse, 'current', 1);
    await mock.initializedOMEMO(_converse);
    await mock.openChatBoxFor(_converse, contact_jid);
    return _converse.chatboxviews.get(contact_jid);
}

/**
 * @param {any} view
 * @returns {HTMLElement|null}
 */
function getAlertContent(view) {
    return view.querySelector('.omemo-undecryptable__content');
}

describe('The undecryptable OMEMO notice', function () {
    it(
        'absorbs the error lines that earlier versions stored, counting them once',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            const error_attrs = {
                error_condition: 'not-encrypted-for-this-device',
                error_type: 'Decryption',
                is_error: true,
                type: 'error',
                is_archived: true,
                from: contact_jid,
            };
            view.model.messages.create({ ...error_attrs, msgid: 'old-1', time: '2026-11-03T10:00:00Z' });
            view.model.messages.create({ ...error_attrs, msgid: 'old-2', time: '2026-11-03T10:01:00Z' });
            // The same message stored twice still counts once.
            view.model.messages.create({ ...error_attrs, msgid: 'old-2', time: '2026-11-03T10:01:00Z' });
            view.model.messages.create({ type: 'chat', msgid: 'kept', body: 'hello', from: contact_jid });

            _converse.api.trigger('afterMessagesFetched', view.model);

            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.history.length === 2);
            expect(view.model.messages.filter((m) => m.get('is_error')).length).toBe(0);
            expect(view.model.messages.pluck('msgid')).toContain('kept');
            await u.waitUntil(() => getAlertContent(view));
            expect(getAlertContent(view).textContent).toContain(
                'Earlier messages that cannot be read in this browser: 2',
            );
        }),
    );

    it(
        'counts two different undecryptable messages without creating lines for them',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            const conn = _converse.api.connection.get();

            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'a' })),
            );
            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'b' })),
            );

            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.recent.length === 2);
            expect(view.model.messages.length).toBe(0);
            await u.waitUntil(() => getAlertContent(view));
            expect(getAlertContent(view).textContent).toContain(
                'Recent messages that were not encrypted for this browser: 2',
            );
        }),
    );

    it(
        'counts the same message once when it is delivered again',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            const conn = _converse.api.connection.get();

            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'same' })),
            );
            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.recent.length === 1);

            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'same' })),
            );
            // Let the second delivery go through the hook before checking.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(view.model.get('omemo_undecryptable').recent.length).toBe(1);
            expect(view.model.messages.length).toBe(0);
        }),
    );

    it(
        'counts an archived undecryptable message as history',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            // Archived messages reach us via a MAM query, which the live stream
            // handler skips, so hand the stanza to the message handler directly.
            await _converse.exports.handleMessageStanza(
                undecryptableStanza(_converse, { from: contact_jid, id: 'old', archived: true, archive_id: 'mam-1' }),
            );

            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.history.length === 1);
            expect(view.model.get('omemo_undecryptable').recent.length).toBe(0);
            await u.waitUntil(() => getAlertContent(view));
            expect(getAlertContent(view).textContent).toContain(
                'Earlier messages that cannot be read in this browser: 1',
            );
        }),
    );

    it(
        'counts a message older than this device’s OMEMO store as history',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            const conn = _converse.api.connection.get();

            // The message arrives now, which is before a store created in the future.
            _converse.state.omemo_store.set('created_at', '2100-01-01T00:00:00.000Z');
            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'pre' })),
            );

            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.history.length === 1);
            expect(view.model.get('omemo_undecryptable').recent.length).toBe(0);
        }),
    );

    it(
        'hides when acknowledged and comes back with the new total when another failure arrives',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const contact_jid = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
            const view = await openChatWithOMEMO(_converse, contact_jid);
            const conn = _converse.api.connection.get();

            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'one' })),
            );
            await u.waitUntil(() => getAlertContent(view));

            const button = view.querySelector('.omemo-undecryptable__ok');
            button.click();
            await u.waitUntil(() => !view.querySelector('.omemo-undecryptable__content'));
            expect(view.model.get('omemo_undecryptable').dismissed_total).toBe(1);

            conn._dataRecv(
                mock.createRequest(_converse, undecryptableStanza(_converse, { from: contact_jid, id: 'two' })),
            );
            await u.waitUntil(() => getAlertContent(view));
            expect(getAlertContent(view).textContent).toContain(
                'Recent messages that were not encrypted for this browser: 2',
            );
        }),
    );

    it(
        'counts undecryptable groupchat messages on the groupchat',
        mock.initConverse(converse, ['chatBoxesFetched'], {}, async function (_converse) {
            const muc_jid = 'lounge@montague.lit';
            const nick = 'romeo';
            await mock.openAndEnterMUC(_converse, muc_jid, nick);
            await mock.initializedOMEMO(_converse);
            const view = _converse.chatboxviews.get(muc_jid);
            const conn = _converse.api.connection.get();

            conn._dataRecv(
                mock.createRequest(
                    _converse,
                    undecryptableStanza(_converse, { from: `${muc_jid}/newguy`, type: 'groupchat', id: 'muc-1' }),
                ),
            );

            await u.waitUntil(() => view.model.get('omemo_undecryptable')?.recent.length === 1);
            expect(view.model.messages.length).toBe(0);
            await u.waitUntil(() => getAlertContent(view));
        }),
    );
});

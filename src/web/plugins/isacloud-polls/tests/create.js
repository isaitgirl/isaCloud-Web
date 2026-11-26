import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u } = converse.env;

const MUC_JID = 'lounge@montague.lit';
const CONTACT_JID = mock.cur_names[0].replace(/ /g, '.').toLowerCase() + '@montague.lit';
const SETTINGS = {
    whitelisted_plugins: ['converse-isacloud-polls'],
    // The voice-messages plugin also adds an attachment item and waits for disco.
    blacklisted_plugins: ['converse-voice-messages'],
    // Keep the menu fast: the poll item doesn't need HTTP Upload.
    visible_toolbar_buttons: { fileupload: false, location: false },
};

/**
 * @param {any} _converse
 * @returns {Promise<HTMLElement>}
 */
async function openRoom(_converse) {
    await mock.openAndEnterMUC(_converse, MUC_JID, 'romeo');
    return _converse.chatboxviews.get(MUC_JID);
}

/**
 * @param {HTMLElement} view
 * @returns {Promise<any>}
 */
async function openPollModal(view) {
    await mock.openAttachmentMenu(view);
    await u.waitUntil(() => view.querySelector('.attachment-menu__item[data-name="poll"]'));
    view.querySelector('.attachment-menu__item[data-name="poll"]').click();
    return u.waitUntil(() => document.querySelector('converse-isacloud-poll-modal'));
}

/**
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function type(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @param {any} modal
 * @returns {HTMLButtonElement}
 */
function createButton(modal) {
    return /** @type {HTMLButtonElement} */ (modal.querySelector('.modal-footer button[type="submit"]'));
}

/** @param {any} send */
const sentPollStanzas = (send) =>
    send.mock.calls
        .map(([stanza]) => (stanza instanceof Element ? stanza : stanza.tree()))
        .filter((el) => el.querySelector?.('poll'));

describe('Creating a poll', function () {
    it(
        'sends the poll with the fallback body and shows the card',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const view = await openRoom(_converse);
            const modal = await openPollModal(view);
            const send = vi.spyOn(_converse.api.connection.get(), 'send');

            type(modal.querySelector('input[name="poll-title"]'), 'Almoço?');
            const options = modal.querySelectorAll('input[name="option"]');
            type(options[0], 'Pizza');
            type(options[1], 'Sushi');

            await u.waitUntil(() => !createButton(modal).disabled);
            createButton(modal).click();

            const stanza = await u.waitUntil(() => sentPollStanzas(send)[0]);
            const poll = stanza.querySelector('poll');
            expect(poll.getAttribute('xmlns')).toBe('urn:fluux:poll:0');
            expect(poll.querySelector('title').textContent).toBe('Almoço?');
            expect(
                [...poll.querySelectorAll('option')].map((el) => [el.getAttribute('emoji'), el.textContent]),
            ).toEqual([
                ['1️⃣', 'Pizza'],
                ['2️⃣', 'Sushi'],
            ]);
            expect(poll.getAttribute('allow-multiple')).toBeNull();
            expect(poll.getAttribute('hide-results')).toBeNull();

            expect(stanza.querySelector(':scope > body')?.textContent ?? stanza.querySelector('body').textContent).toBe(
                '📊 Poll: Almoço?\n1️⃣ Pizza\n2️⃣ Sushi',
            );
            expect(stanza.querySelector('fallback').getAttribute('for')).toBe('urn:fluux:poll:0');
            expect(stanza.querySelector('store')).not.toBeNull();

            const card = await u.waitUntil(() => view.querySelector('.isacloud-poll'));
            expect(card.querySelector('.isacloud-poll__title').textContent).toBe('Almoço?');
        }),
    );

    it(
        'sends the flags only when they are set',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const view = await openRoom(_converse);
            const modal = await openPollModal(view);
            const send = vi.spyOn(_converse.api.connection.get(), 'send');

            type(modal.querySelector('input[name="poll-title"]'), 'Almoço?');
            const options = modal.querySelectorAll('input[name="option"]');
            type(options[0], 'Pizza');
            type(options[1], 'Sushi');
            const multiple = /** @type {HTMLInputElement} */ (modal.querySelector('#isa-poll-multiple'));
            multiple.checked = true;
            multiple.dispatchEvent(new Event('change', { bubbles: true }));
            const hide = /** @type {HTMLInputElement} */ (modal.querySelector('#isa-poll-hide'));
            hide.checked = true;
            hide.dispatchEvent(new Event('change', { bubbles: true }));

            await u.waitUntil(() => !createButton(modal).disabled);
            createButton(modal).click();

            const stanza = await u.waitUntil(() => sentPollStanzas(send)[0]);
            const poll = stanza.querySelector('poll');
            expect(poll.getAttribute('allow-multiple')).toBe('true');
            expect(poll.getAttribute('hide-results')).toBe('true');
        }),
    );

    it(
        'keeps the create button disabled until there is a question and two options',
        mock.initConverse(converse, [], SETTINGS, async function (_converse) {
            const view = await openRoom(_converse);
            const modal = await openPollModal(view);

            expect(createButton(modal).disabled).toBe(true);
            type(modal.querySelector('input[name="poll-title"]'), 'Almoço?');
            expect(createButton(modal).disabled).toBe(true);
            const options = modal.querySelectorAll('input[name="option"]');
            type(options[0], 'Pizza');
            expect(createButton(modal).disabled).toBe(true);
            type(options[1], 'Sushi');
            await u.waitUntil(() => !createButton(modal).disabled);
        }),
    );

    it(
        'is not offered in a one-to-one chat',
        mock.initConverse(converse, ['chatBoxesFetched'], SETTINGS, async function (_converse) {
            await mock.waitForRoster(_converse, 'current', 1);
            await mock.openChatBoxFor(_converse, CONTACT_JID);
            const view = _converse.chatboxviews.get(CONTACT_JID);
            expect(view.querySelector('.attachment-menu__item[data-name="poll"]')).toBeNull();
        }),
    );
});

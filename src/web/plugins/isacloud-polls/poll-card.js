/**
 * @description
 *  isaCloud: the card of a Fluux poll (`urn:fluux:poll:0`).
 *
 *  The tally comes from the message's XEP-0444 reactions. A click on an option
 *  turns into a reaction with the option's emoji: a poll vote **is** a
 *  reaction. Single-choice polls keep only the clicked option among the option
 *  emojis, preserving reactions that are not options (`👍`); multiple-choice
 *  polls toggle just that option. The vote is sent in the clear even in an
 *  OMEMO room, because that is what Fluux and the native apps count (and the
 *  poll element itself already travels outside the encryption).
 *
 *  The card replaces the textual `<body>` fallback in groupchats (see
 *  `index.js`); in 1:1 chats the body is shown as an ordinary message. A poll
 *  keeps this card once closed, with the tally frozen by the closing message;
 *  only a `<poll-closed>` without its original (someone who joined later) gets
 *  the frozen result card.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html, nothing } from 'lit';
import { api, converse, u } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { alertSendError } from 'shared/chat/send-errors.js';
import { closedTallyTotal, computePollTally, isPollExpired, toggleVote } from './tally.js';
import { t } from './i18n.js';

const { dayjs } = converse.env;

/**
 * @param {string} iso
 * @returns {string}
 */
function formatDeadline(iso) {
    return dayjs(iso).format('lll');
}

/**
 * @param {number} total
 * @returns {string}
 */
function votesLabel(total) {
    return total === 1 ? t('1 vote') : t('%1$s votes', total);
}

class PollCard extends CustomElement {
    static get properties() {
        return {
            model: { type: Object },
        };
    }

    constructor() {
        super();
        this.model = null;
    }

    initialize() {
        this.listenTo(this.model, 'change:reactions', () => this.requestUpdate());
        this.listenTo(this.model, 'change:isacloud_poll_closed', () => this.requestUpdate());
        this.listenTo(this.model, 'change:isacloud_poll_closed_at', () => this.requestUpdate());
        this.requestUpdate();
    }

    /**
     * Sends our new reaction set for this poll. The reactions API updates the
     * message optimistically and rolls it back if the stanza fails.
     * @param {string} emoji
     * @returns {Promise<void>}
     */
    async vote(emoji) {
        const poll = this.model.get('isacloud_poll');
        const chatbox = this.model.collection?.chatbox;
        if (!poll || !chatbox || isPollExpired(poll)) return;

        const reactor_key = u.reactions.getOwnReactionJID(chatbox);
        const current = this.model.get('reactions')?.[reactor_key] ?? [];
        try {
            await api.reactions.send(this.model, toggleVote(poll, current, emoji), { encrypted: false });
        } catch (e) {
            alertSendError(/** @type {Error} */ (e));
        }
    }

    /**
     * @param {{emoji: string, label: string, count: number}} option
     * @param {number} total
     * @param {boolean} mine
     * @param {boolean} show_results
     * @param {boolean} can_vote
     */
    renderOption(option, total, mine, show_results, can_vote) {
        const percentage = total ? Math.round((option.count / total) * 100) : 0;
        const content = html` <span class="isacloud-poll__emoji" aria-hidden="true">${option.emoji}</span>
            <span class="isacloud-poll__option-body">
                <span class="isacloud-poll__option-head">
                    <span class="isacloud-poll__label">${option.label}</span>
                    ${show_results ? html`<span class="isacloud-poll__count">${option.count}</span>` : nothing}
                    ${
                        mine
                            ? html`<converse-icon
                                  class="fa fa-check isacloud-poll__check"
                                  size="0.9em"
                                  role="img"
                                  aria-label="${t('Your vote')}"
                              ></converse-icon>`
                            : nothing
                    }
                </span>
                ${
                    show_results
                        ? html`<span class="isacloud-poll__bar" aria-hidden="true">
                              <span class="isacloud-poll__bar-fill" style="width: ${percentage}%"></span>
                          </span>`
                        : nothing
                }
            </span>`;

        if (!can_vote) {
            return html`<div class="isacloud-poll__option ${mine ? 'isacloud-poll__option--mine' : ''}">
                ${content}
            </div>`;
        }
        return html`<button
            type="button"
            class="isacloud-poll__option ${mine ? 'isacloud-poll__option--mine' : ''}"
            aria-pressed="${mine ? 'true' : 'false'}"
            @click=${() => this.vote(option.emoji)}
        >
            ${content}
        </button>`;
    }

    /**
     * The card of a poll. A closed poll keeps the layout of an open one, but
     * shows the frozen tally kept by the closing message: the reactions may
     * have been pruned since, and the result must survive the closing card
     * being consumed.
     * @param {import('./tally').Poll} poll
     */
    renderPoll(poll) {
        const closed = this.model.get('isacloud_poll_closed');
        const closed_at = this.model.get('isacloud_poll_closed_at');
        const is_closed = !!closed_at || !!closed;
        const chatbox = this.model.collection?.chatbox;
        const reactor_key = chatbox ? u.reactions.getOwnReactionJID(chatbox) : null;
        const { options, total, my_votes } = computePollTally(poll, this.model.get('reactions'), reactor_key);

        // Frozen counts per option, keeping every option of the poll visible.
        const frozen =
            is_closed && closed?.tally ? new Map(closed.tally.map((entry) => [entry.emoji, entry.count])) : null;
        const tally = frozen ? options.map((option) => ({ ...option, count: frozen.get(option.emoji) ?? 0 })) : options;
        const frozen_total = is_closed && closed?.tally ? closedTallyTotal(closed.tally) : total;

        const show_results = is_closed || !poll.hide_results || my_votes.length > 0;
        const expired = isPollExpired(poll);
        const deadline = poll.deadline ? formatDeadline(poll.deadline) : null;

        let footer;
        if (is_closed) {
            footer = frozen_total ? `${t('Poll closed')} · ${votesLabel(frozen_total)}` : t('Poll closed');
        } else if (expired) {
            footer = deadline ? `${t('Poll closed')} · ${t('Ended on %1$s', deadline)}` : t('Poll closed');
        } else if (poll.hide_results && !my_votes.length) {
            footer = t('Vote to see the results');
        } else if (total === 0) {
            footer = t('No votes yet');
        } else {
            footer = votesLabel(total);
        }

        return html`<section
            class="isacloud-poll ${is_closed ? 'isacloud-poll--closed' : ''}"
            aria-label="${t('Poll')}"
        >
            <div class="isacloud-poll__title">${poll.title}</div>
            ${poll.description ? html`<div class="isacloud-poll__description">${poll.description}</div>` : nothing}
            ${
                poll.allow_multiple
                    ? html`<div class="isacloud-poll__hint">${t('Select one or more options')}</div>`
                    : nothing
            }
            <div class="isacloud-poll__options" aria-label="${t('Poll options')}">
                ${tally.map((option) =>
                    this.renderOption(
                        option,
                        frozen_total,
                        my_votes.includes(option.emoji),
                        show_results,
                        !expired && !is_closed,
                    ),
                )}
            </div>
            <div class="isacloud-poll__footer">
                <span>${footer}</span>
                ${
                    !expired && !is_closed && deadline
                        ? html`<span class="isacloud-poll__deadline">${t('Ends on %1$s', deadline)}</span>`
                        : nothing
                }
            </div>
        </section>`;
    }

    /**
     * @param {{title?: string, description?: string, tally: {emoji: string, label: string, count: number, voters: string[]}[]}} closed
     */
    renderClosedPoll(closed) {
        const total = closedTallyTotal(closed.tally);
        const footer = total === 0 ? t('Final result') : `${t('Final result')} · ${votesLabel(total)}`;
        return html`<section class="isacloud-poll isacloud-poll--closed" aria-label="${t('Poll')}">
            <div class="isacloud-poll__title">${closed.title || t('Poll')}</div>
            ${closed.description ? html`<div class="isacloud-poll__description">${closed.description}</div>` : nothing}
            <div class="isacloud-poll__options" aria-label="${t('Poll options')}">
                ${closed.tally.map((entry) =>
                    this.renderOption(
                        { emoji: entry.emoji, label: entry.label || entry.emoji, count: entry.count },
                        total,
                        false,
                        true,
                        false,
                    ),
                )}
            </div>
            <div class="isacloud-poll__footer"><span>${footer}</span></div>
        </section>`;
    }

    render() {
        if (!this.model) return nothing;
        // A poll keeps its own card once closed, using the frozen tally. Only a
        // closing message whose original is not here (we joined later) gets the
        // frozen-result card.
        const poll = this.model.get('isacloud_poll');
        if (poll) return this.renderPoll(poll);
        const closed = this.model.get('isacloud_poll_closed');
        if (closed) return this.renderClosedPoll(closed);
        return nothing;
    }
}

api.elements.define('converse-isacloud-poll', PollCard);

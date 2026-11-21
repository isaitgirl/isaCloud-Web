import { closedTallyTotal, computePollTally, getMyVotes, isPollExpired, toggleVote } from '../tally.js';

/**
 * @param {Object} [overrides]
 * @returns {import('../tally').Poll}
 */
function poll(overrides = {}) {
    return {
        title: 'Almoço?',
        allow_multiple: false,
        hide_results: false,
        options: [
            { emoji: '1️⃣', label: 'Pizza' },
            { emoji: '2️⃣', label: 'Sushi' },
        ],
        ...overrides,
    };
}

describe('The poll tally', function () {
    it('counts a single-choice vote only in the last option the voter picked', function () {
        const reactions = {
            ana: ['1️⃣'],
            bia: ['2️⃣'],
            // A legacy client that reacted with both numbers.
            caio: ['1️⃣', '2️⃣'],
        };
        const { options, total } = computePollTally(poll(), reactions);
        expect(options.map((option) => option.count)).toEqual([1, 2]);
        expect(total).toBe(3);
    });

    it('counts each option separately when multiple choices are allowed', function () {
        const reactions = { ana: ['1️⃣', '2️⃣'], bia: ['1️⃣'] };
        const { options, total } = computePollTally(poll({ allow_multiple: true }), reactions);
        expect(options.map((option) => option.count)).toEqual([2, 1]);
        expect(total).toBe(2);
    });

    it('ignores reactions that are not poll options', function () {
        const reactions = { ana: ['👍', '1️⃣'], bia: ['👍'] };
        const { options, total } = computePollTally(poll(), reactions);
        expect(options.map((option) => option.count)).toEqual([1, 0]);
        expect(total).toBe(1);
    });

    it('does not count the same voter twice', function () {
        const reactions = { ana: ['1️⃣', '1️⃣'], bia: ['1️⃣'] };
        expect(computePollTally(poll(), reactions).total).toBe(2);
    });

    it('reports the options the current reactor picked', function () {
        const reactions = { ana: ['1️⃣'], bia: ['2️⃣', '👍'] };
        expect(getMyVotes(poll({ allow_multiple: true }), reactions, 'bia')).toEqual(['2️⃣']);
        expect(computePollTally(poll(), reactions, 'ana').my_votes).toEqual(['1️⃣']);
    });

    it('treats a deadline in the past as expired and a future or missing one as open', function () {
        const now = Date.parse('2026-11-21T12:00:00Z');
        expect(isPollExpired(poll({ deadline: '2026-11-20T12:00:00Z' }), now)).toBe(true);
        expect(isPollExpired(poll({ deadline: '2026-11-22T12:00:00Z' }), now)).toBe(false);
        expect(isPollExpired(poll(), now)).toBe(false);
        expect(isPollExpired(poll({ deadline: 'not a date' }), now)).toBe(false);
    });

    it('counts the unique voters of a frozen tally', function () {
        const tally = [
            { emoji: '1️⃣', label: 'Pizza', count: 2, voters: ['ana', 'bia'] },
            { emoji: '2️⃣', label: 'Sushi', count: 1, voters: ['ana'] },
        ];
        expect(closedTallyTotal(tally)).toBe(2);
    });

    it('falls back to the sum of the counts when the tally has no voters', function () {
        const tally = [
            { emoji: '1️⃣', label: 'Pizza', count: 2, voters: [] },
            { emoji: '2️⃣', label: 'Sushi', count: 1, voters: [] },
        ];
        expect(closedTallyTotal(tally)).toBe(3);
        expect(closedTallyTotal([])).toBe(0);
    });
});

describe('The next reaction set after a vote', function () {
    it('adds a single-choice option and replaces the previous one', function () {
        expect(toggleVote(poll(), [], '1️⃣')).toEqual(['1️⃣']);
        expect(toggleVote(poll(), ['1️⃣'], '2️⃣')).toEqual(['2️⃣']);
    });

    it('removes the vote when the same option is clicked again', function () {
        expect(toggleVote(poll(), ['1️⃣'], '1️⃣')).toEqual([]);
    });

    it('keeps reactions that are not options', function () {
        expect(toggleVote(poll(), ['👍'], '1️⃣')).toEqual(['👍', '1️⃣']);
        expect(toggleVote(poll(), ['👍', '1️⃣'], '1️⃣')).toEqual(['👍']);
        expect(toggleVote(poll(), ['👍'], '1️⃣').includes('👍')).toBe(true);
    });

    it('toggles options independently in a multiple-choice poll', function () {
        const multiple = poll({ allow_multiple: true });
        expect(toggleVote(multiple, ['1️⃣'], '2️⃣')).toEqual(['1️⃣', '2️⃣']);
        expect(toggleVote(multiple, ['1️⃣', '2️⃣'], '1️⃣')).toEqual(['2️⃣']);
        // Options are toggles, not a single choice.
        expect(toggleVote(multiple, ['👍'], '2️⃣')).toEqual(['👍', '2️⃣']);
    });

    it('replaces a legacy set with several option emojis when one is clicked', function () {
        expect(toggleVote(poll(), ['1️⃣', '2️⃣', '👍'], '1️⃣')).toEqual(['👍', '1️⃣']);
    });

    it('ignores an emoji that is not one of the options', function () {
        expect(toggleVote(poll(), ['👍'], '🎉')).toEqual(['👍']);
    });
});

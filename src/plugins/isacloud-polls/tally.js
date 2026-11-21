/**
 * @description
 *  isaCloud: the pure tally rules of a Fluux poll (`urn:fluux:poll:0`).
 *
 *  A vote is a XEP-0444 reaction on the poll message, so the only input is the
 *  message's `reactions` map (reactor key → emojis). The keys are whatever the
 *  reactions plugin uses: `occupant_id` when the room has XEP-0421, else the
 *  real bare JID in a non-anonymous room, else the full JID.
 *
 *  Single-choice polls count each voter in the **last** option, in option
 *  order, that they reacted to. That mirrors the Fluux client and tolerates a
 *  legacy client that reacted with several option emojis. Multiple-choice polls
 *  count a voter once per option they picked. Reactions that are not options
 *  (such as `👍`) don't count as votes and are left to the reaction row.
 * @license Mozilla Public License (MPLv2)
 */

/**
 * @typedef {object} PollOption
 * @property {string} emoji
 * @property {string} label
 */

/**
 * @typedef {object} Poll
 * @property {string} title
 * @property {string} [description]
 * @property {boolean} allow_multiple
 * @property {boolean} hide_results
 * @property {string} [deadline] - ISO 8601
 * @property {PollOption[]} options
 */

/**
 * @typedef {Record<string, string[]>} Reactions - Reactor key → emojis
 */

/**
 * @param {Poll} poll
 * @returns {string[]}
 */
export function getOptionEmojis(poll) {
    return (poll?.options ?? []).map((option) => option.emoji);
}

/**
 * A deadline in the past blocks voting. A missing or unreadable deadline never
 * does; the protocol says the check is client-side only.
 * @param {Poll} poll
 * @param {number} [now] - Milliseconds since the epoch, for the tests.
 * @returns {boolean}
 */
export function isPollExpired(poll, now = Date.now()) {
    if (!poll?.deadline) return false;
    const deadline = Date.parse(poll.deadline);
    return Number.isFinite(deadline) && deadline <= now;
}

/**
 * The option emojis this reactor picked, in no particular order.
 * @param {Poll} poll
 * @param {Reactions} reactions
 * @param {string|null} reactor_key
 * @returns {string[]}
 */
export function getMyVotes(poll, reactions, reactor_key) {
    if (!reactor_key) return [];
    const option_emojis = new Set(getOptionEmojis(poll));
    return (reactions?.[reactor_key] ?? []).filter((emoji) => option_emojis.has(emoji));
}

/**
 * @typedef {object} TallyOption
 * @property {string} emoji
 * @property {string} label
 * @property {number} count
 * @property {string[]} voters - The reactor keys counted for this option.
 */

/**
 * @typedef {object} Tally
 * @property {TallyOption[]} options
 * @property {number} total - Unique voters who picked at least one option.
 * @property {string[]} my_votes
 */

/**
 * Counts the votes. With a `reactor_key`, also reports which options that
 * reactor picked, for the check mark.
 * @param {Poll} poll
 * @param {Reactions} [reactions]
 * @param {string|null} [reactor_key]
 * @returns {Tally}
 */
export function computePollTally(poll, reactions = {}, reactor_key = null) {
    /** @type {TallyOption[]} */
    const options = (poll?.options ?? []).map((option) => ({ ...option, count: 0, voters: [] }));
    const index_by_emoji = new Map(options.map((option, index) => [option.emoji, index]));

    /** @type {Set<string>} */
    const voters = new Set();
    for (const [key, emojis] of Object.entries(reactions ?? {})) {
        const picked = [...new Set(emojis ?? [])].filter((emoji) => index_by_emoji.has(emoji));
        if (!picked.length) continue;
        voters.add(key);

        if (poll?.allow_multiple) {
            for (const emoji of picked) {
                const option = options[/** @type {number} */ (index_by_emoji.get(emoji))];
                option.count += 1;
                option.voters.push(key);
            }
        } else {
            // The last option in the poll's order wins.
            /** @type {TallyOption|null} */
            let last = null;
            for (const option of options) {
                if (picked.includes(option.emoji)) last = option;
            }
            if (last) {
                last.count += 1;
                last.voters.push(key);
            }
        }
    }

    return { options, total: voters.size, my_votes: getMyVotes(poll, reactions, reactor_key) };
}

/**
 * The next reaction set when an option is clicked. Reactions that are not
 * options (such as `👍`) are preserved; a new option is appended at the end.
 *
 * Single choice removes every option emoji and adds the clicked one, except
 * when the clicked option is the only one already picked, which removes it.
 * The rule tolerates a legacy set with several option emojis: clicking any
 * option replaces them all.
 * @param {Poll} poll
 * @param {string[]} current - Our current reactions, as sent to the server.
 * @param {string} option_emoji
 * @returns {string[]}
 */
export function toggleVote(poll, current = [], option_emoji) {
    const option_emojis = new Set(getOptionEmojis(poll));
    if (!option_emoji || !option_emojis.has(option_emoji)) return [...current];

    const next = new Set(current);
    if (poll.allow_multiple) {
        if (next.has(option_emoji)) next.delete(option_emoji);
        else next.add(option_emoji);
        return [...next];
    }

    const picked = current.filter((emoji) => option_emojis.has(emoji));
    if (picked.length === 1 && picked[0] === option_emoji) {
        next.delete(option_emoji);
    } else {
        for (const emoji of option_emojis) next.delete(emoji);
        next.add(option_emoji);
    }
    return [...next];
}

/**
 * The total shown on a frozen `<poll-closed>` card. The voters are nicks, so
 * the unique count works for both poll kinds; without them (the protocol makes
 * `voters` optional) the counts are summed as a fallback.
 * @param {{voters?: string[], count: number}[]} tally
 * @returns {number}
 */
export function closedTallyTotal(tally = []) {
    const voters = new Set();
    let counts = 0;
    for (const entry of tally) {
        counts += Number(entry.count) || 0;
        for (const voter of entry.voters ?? []) voters.add(voter);
    }
    return voters.size || counts;
}

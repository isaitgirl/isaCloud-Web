/**
 * @description
 *  isaCloud: the meet-api client that creates a Galene room.
 *
 *  `POST {base}/meet-api/v1/rooms` with `{ hostName }` answers `201` and a room
 *  descriptor. The host URL in that answer is a credential: it is never logged,
 *  and its response body is never echoed in an error. Everything the descriptor
 *  says is checked before it is used; a status other than 201, a room ID that
 *  is not safe in a path, a URL on another host, a public link that is not
 *  `/join/<roomID>`, or an unreadable expiry is an error.
 * @license Mozilla Public License (MPLv2)
 */
import { DEFAULT_CONFERENCE_URL, ROOM_ID_PATTERN, isHostURLForRoom, normalizeBase, roomIDFromURL } from './links.js';

/** The path of the rooms collection, under the configured base. */
export const ROOMS_PATH = '/meet-api/v1/rooms';

/** How long the whole request may take, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * @typedef {object} ConferenceRoom
 * @property {string} roomID
 * @property {string} roomURL
 * @property {string} hostURL
 * @property {string} hostKey
 * @property {string} expiresAt - ISO 8601, so that it survives storage.
 */

/**
 * Reads an expiry, which may be an ISO string or a number of milliseconds or
 * nanoseconds since the epoch.
 * @param {unknown} value
 * @returns {Date|null}
 */
export function parseExpiresAt(value) {
    let ms;
    if (typeof value === 'number') {
        ms = value;
    } else if (typeof value === 'string' && value) {
        ms = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    } else {
        return null;
    }
    if (!Number.isFinite(ms)) return null;
    // The server may send nanoseconds; `Date` counts milliseconds.
    if (ms > 1e14) ms = Math.floor(ms / 1e6);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Checks a room descriptor and returns the fields the plugin uses, with the
 * expiry normalised to ISO 8601. Throws on any deviation; the message never
 * contains the descriptor, since it carries the host token.
 * @param {unknown} data
 * @param {string} [base]
 * @returns {ConferenceRoom}
 */
export function validateRoom(data, base = DEFAULT_CONFERENCE_URL) {
    if (!data || typeof data !== 'object') throw new Error('Conference API: the response is not an object');
    const { roomID, roomURL, hostURL, hostKey, expiresAt } = /** @type {Record<string, unknown>} */ (data);

    if (typeof roomID !== 'string' || !ROOM_ID_PATTERN.test(roomID)) {
        throw new Error('Conference API: invalid room ID');
    }
    if (typeof roomURL !== 'string' || roomIDFromURL(roomURL, base) !== roomID) {
        throw new Error('Conference API: invalid public room URL');
    }
    if (typeof hostURL !== 'string' || !isHostURLForRoom(hostURL, roomID, base)) {
        throw new Error('Conference API: invalid host URL');
    }
    if (typeof hostKey !== 'string' || !hostKey) {
        throw new Error('Conference API: invalid host key');
    }
    const expires = parseExpiresAt(expiresAt);
    if (!expires) throw new Error('Conference API: invalid expiry');

    return {
        roomID,
        roomURL,
        hostURL,
        hostKey,
        expiresAt: expires.toISOString(),
    };
}

/**
 * Creates a room on the conference service. The caller owns the user gesture
 * (and therefore the tab that will open the host URL); this only talks to the
 * API.
 * @param {string} hostName - The display name the room is created under.
 * @param {string} [base] - The configured conference URL.
 * @returns {Promise<ConferenceRoom>}
 */
export async function createRoom(hostName, base = DEFAULT_CONFERENCE_URL) {
    if (navigator.onLine === false) throw new Error('Conference API: offline');

    const response = await fetch(`${normalizeBase(base)}${ROOMS_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ hostName }),
        credentials: 'omit',
        mode: 'cors',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status !== 201) {
        // The status is enough to tell the failure apart; the body is not read.
        throw new Error(`Conference API: unexpected status ${response.status}`);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('Conference API: the response is not JSON');
    }
    return validateRoom(data, base);
}

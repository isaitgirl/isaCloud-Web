/**
 * @description
 *  isaCloud: strict parsing and validation of the video conference URLs.
 *
 *  The public link a conference puts in a message is always
 *  `https://<host>/join/<roomID>`, and the host URL kept in `localStorage` is
 *  `https://<host>/u/<roomID>/?token=…`. Anything else is not treated as ours:
 *  another scheme, another host (not merely a prefix), a port, credentials, a
 *  query or fragment on the public link, or a trailing slash.
 *
 *  The host comes from the `isacloud_conference_url` setting, whose default is
 *  `https://meet.isacloud.cc`. Nothing here hardcodes it.
 * @license Mozilla Public License (MPLv2)
 */

/** The default base URL of the conference service. */
export const DEFAULT_CONFERENCE_URL = 'https://meet.isacloud.cc';

/** A room ID, as the meet-api accepts and returns it. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Removes the trailing slashes from the configured base URL, so that joining
 * paths onto it cannot double a slash. Falls back to the default when the
 * setting is empty.
 * @param {string} [base]
 * @returns {string}
 */
export function normalizeBase(base) {
    return String(base || DEFAULT_CONFERENCE_URL).replace(/\/+$/, '');
}

/**
 * Parses an `https` URL on exactly the base's host, with no port and no
 * credentials. Any path, query and fragment are left to the caller, since the
 * host URL carries a token in its query.
 * @param {string} text
 * @param {string} [base]
 * @returns {URL|null}
 */
function parseOnBase(text, base) {
    const value = String(text ?? '');
    let base_url;
    let url;
    try {
        base_url = new URL(normalizeBase(base));
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    // `URL` normalises a default `:443` away, so look at the authority as it
    // was written. It also catches a `user:password@host`, which `url.host`
    // would not.
    const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority) return null;
    if (authority.toLowerCase() !== base_url.hostname.toLowerCase()) return null;
    return url;
}

/**
 * The room ID of a public conference link, or `null` when the text is not one.
 * Only `https://<host>/join/<roomID>` qualifies: no trailing slash, query or
 * fragment, and no port or credentials.
 * @param {string} text
 * @param {string} [base]
 * @returns {string|null}
 */
export function roomIDFromURL(text, base) {
    const url = parseOnBase(text, base);
    if (!url || url.search || url.hash) return null;
    // `URL` drops an empty `?` or `#`, so compare the raw path to reject them
    // too, keeping the public link shape to exactly `/join/<id>`.
    const raw_path = String(text).replace(/^https:\/\/[^/?#]+/i, '');
    if (raw_path !== url.pathname) return null;
    const match = /^\/join\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    return match ? match[1] : null;
}

/**
 * Whether the text is an `https` URL on the conference service's host, without
 * credentials. The query and fragment are allowed, because the host URL keeps
 * its token there.
 * @param {string} text
 * @param {string} [base]
 * @returns {boolean}
 */
export function isMeetURL(text, base) {
    return parseOnBase(text, base) !== null;
}

/**
 * Whether the URL is a host URL for this room: `https` on the service's host,
 * with a path starting at `/u/<roomID>/`.
 * @param {string} text
 * @param {string} room_id
 * @param {string} [base]
 * @returns {boolean}
 */
export function isHostURLForRoom(text, room_id, base) {
    if (!ROOM_ID_PATTERN.test(String(room_id ?? ''))) return false;
    const url = parseOnBase(text, base);
    if (!url) return false;
    return url.pathname.startsWith(`/u/${room_id}/`);
}

/* Shared bootstrap for the Converse demo pages.
 *
 * Reads per-page settings from a <script type="application/json"
 * id="converse-config"> data block and initializes Converse. Kept external
 * (not inline) and config-as-data (not executable script) so the pages can be
 * served under a Content-Security-Policy without `script-src 'unsafe-inline'`.
 * See docs/src/content/docs/security.md.
 */
// Ask the browser not to evict our IndexedDB data (OMEMO keys, history) under
// storage pressure. Best effort: browsers may refuse or ignore it.
if (navigator.storage?.persist) {
    navigator.storage
        .persisted()
        .then((ok) => ok || navigator.storage.persist())
        .catch(() => {});
}

const el = document.getElementById('converse-config');
const config = el ? JSON.parse(el.textContent) : {};

// Shareable links point at the page the user is on, so a mirror hostname (for
// networks that block the main one) hands out links to itself instead of to a
// host those networks refuse to open. The page config can still pin the URL,
// or set it to "" to turn shareable links off.
config.shareable_link_url ??= `${location.origin}/`;

converse.initialize(config);

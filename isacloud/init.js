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
converse.initialize(el ? JSON.parse(el.textContent) : {});

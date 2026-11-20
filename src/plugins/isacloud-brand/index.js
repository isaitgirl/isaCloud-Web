/**
 * @description
 *  isaCloud: per-deployment branding.
 *
 *  The fork is shared by more than one domain. A deployment changes the logo
 *  shown on the login form and on the empty chat screen through these settings;
 *  the colours stay in a brand stylesheet loaded after `converse.min.css`.
 *
 *  The defaults keep the isaCloud page exactly as it was: no logo URL means the
 *  balloon SVG in `shared/components/logo.js`, and the link points at
 *  isaCloud's site as before.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { api, converse } from '@converse/headless';

converse.plugins.add('converse-isacloud-brand', {
    initialize() {
        api.settings.extend({
            /** Absolute or page-relative URL of the brand logo. Empty keeps the isaCloud balloon. */
            brand_logo_url: '',
            /** Where the login logo links to. Empty renders the logo without a link. */
            brand_logo_link: 'https://isacloud.com.br',
            /** Used as the logo's alt text and accessible name. */
            brand_name: 'isaCloud',
        });
    },
});

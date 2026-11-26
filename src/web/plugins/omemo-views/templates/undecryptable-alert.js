import { html, nothing } from 'lit';
import { __ } from 'i18n';
import tplComposerPanel from 'shared/chat/templates/composer-panel.js';

/**
 * @param {import('../undecryptable-alert').default} el
 * @param {{ history: number, recent: number }} counts
 */
function tplBar(el, counts) {
    const lines = [];
    if (counts.history > 0) {
        lines.push(
            html`<span class="omemo-undecryptable__line omemo-undecryptable__line--strong"
                    >${__('Earlier messages that cannot be read in this browser: %1$s', counts.history)}</span
                >
                <span class="omemo-undecryptable__line"
                    >${__(
                        'They were encrypted before this login joined your set of OMEMO devices. They can still be read on the devices you were already using.',
                    )}</span
                >`,
        );
    }
    if (counts.recent > 0) {
        lines.push(
            html`<span class="omemo-undecryptable__line omemo-undecryptable__line--strong"
                    >${__('Recent messages that were not encrypted for this browser: %1$s', counts.recent)}</span
                >
                <span class="omemo-undecryptable__line"
                    >${__('Ask the sender to refresh your device list or to trust your new device.')}</span
                >`,
        );
    }

    return tplComposerPanel({
        kind: 'warning',
        icon: html`<converse-icon class="fa fa-lock" color="var(--warning-color)" size="1em"></converse-icon>`,
        content: html`<div class="omemo-undecryptable__content">${lines}</div>`,
        actions: html`<button
            type="button"
            class="btn btn-sm btn-secondary omemo-undecryptable__ok"
            @click=${(/** @type {MouseEvent} */ ev) => el.dismiss(ev)}
        >
            ${__('Got it')}
        </button>`,
    });
}

/**
 * @param {import('../undecryptable-alert').default} el
 * @param {{ history: number, recent: number }|null} counts
 */
export default (el, counts) =>
    html`<div role="status" aria-live="polite">${counts ? tplBar(el, counts) : nothing}</div>`;

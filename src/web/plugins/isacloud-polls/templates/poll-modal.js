/**
 * @description
 *  isaCloud: the form of the poll creation modal.
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { MAX_OPTIONS, OPTION_EMOJIS } from '../send.js';
import { t } from '../i18n.js';

/**
 * @param {Event} ev
 * @returns {string}
 */
const valueOf = (ev) => /** @type {HTMLInputElement} */ (ev.target).value;

/**
 * @param {import('../poll-modal').default} el
 */
export default (el) => {
    const options = el.state.get('options') ?? ['', ''];
    return html`<form
        class="converse-form isacloud-poll-form"
        id="isacloud-poll-form"
        @submit=${(ev) => el.onSubmit(ev)}
    >
        <div class="mb-3">
            <label class="form-label" for="isa-poll-title">${t('Question')}:</label>
            <input
                id="isa-poll-title"
                type="text"
                name="poll-title"
                class="form-control"
                .value=${el.state.get('poll_title') ?? ''}
                @input=${(ev) => el.state.set('poll_title', valueOf(ev))}
                required
            />
        </div>
        <div class="mb-3">
            <label class="form-label" for="isa-poll-description">${t('Description (optional)')}:</label>
            <input
                id="isa-poll-description"
                type="text"
                name="poll-description"
                class="form-control"
                .value=${el.state.get('poll_description') ?? ''}
                @input=${(ev) => el.state.set('poll_description', valueOf(ev))}
            />
        </div>
        <div class="mb-2">
            <span class="form-label">${t('Options')}:</span>
            <div class="isacloud-poll-form__options">
                ${options.map(
                    (value, index) =>
                        html`<div class="isacloud-poll-form__option">
                            <span class="isacloud-poll-form__emoji" aria-hidden="true">${OPTION_EMOJIS[index]}</span>
                            <input
                                type="text"
                                name="option"
                                class="form-control"
                                placeholder="${t('Option')}"
                                .value=${value}
                                @input=${(ev) => el.updateOption(index, valueOf(ev))}
                            />
                            <button
                                type="button"
                                class="btn isacloud-poll-form__remove"
                                title="${t('Remove option')}"
                                aria-label="${t('Remove option')}"
                                ?disabled=${options.length <= 2}
                                @click=${() => el.removeOption(index)}
                            >
                                <converse-icon class="fa fa-times" size="1em"></converse-icon>
                            </button>
                        </div>`,
                )}
            </div>
            ${
                options.length < MAX_OPTIONS
                    ? html`<button
                          type="button"
                          class="btn btn-link isacloud-poll-form__add"
                          @click=${() => el.addOption()}
                      >
                          ${t('Add option')}
                      </button>`
                    : ''
            }
        </div>
        <div class="form-check mb-2">
            <input
                class="form-check-input"
                type="checkbox"
                id="isa-poll-multiple"
                .checked=${!!el.state.get('allow_multiple')}
                @change=${(ev) => el.state.set('allow_multiple', /** @type {HTMLInputElement} */ (ev.target).checked)}
            />
            <label class="form-check-label" for="isa-poll-multiple">${t('Allow multiple choices')}</label>
        </div>
        <div class="form-check mb-2">
            <input
                class="form-check-input"
                type="checkbox"
                id="isa-poll-hide"
                .checked=${!!el.state.get('hide_results')}
                @change=${(ev) => el.state.set('hide_results', /** @type {HTMLInputElement} */ (ev.target).checked)}
            />
            <label class="form-check-label" for="isa-poll-hide">${t('Hide results until voting')}</label>
        </div>
    </form>`;
};

/**
 * @description
 *  isaCloud: the "Create poll" modal (`urn:fluux:poll:0`).
 *
 *  The dialog mirrors the native apps: a required question, an optional
 *  description, two to nine options with the fixed `1️⃣…9️⃣` emojis, and the
 *  two flags. There is no deadline field in this phase. Empty options are
 *  dropped on submit and the emojis follow the remaining order.
 * @copyright 2026, the Converse.js contributors
 * @license Mozilla Public License (MPLv2)
 */
import { html } from 'lit';
import { api } from '@converse/headless';
import BaseModal from 'plugins/modal/modal.js';
import tplPollModal from './templates/poll-modal.js';
import { createPoll, MAX_OPTIONS, OPTION_EMOJIS } from './send.js';
import { t } from './i18n.js';

export default class PollModal extends BaseModal {
    initialize() {
        super.initialize();
        this.state.set({
            poll_title: '',
            poll_description: '',
            options: ['', ''],
            allow_multiple: false,
            hide_results: false,
        });
        this.addEventListener(
            'shown.bs.modal',
            () => /** @type {HTMLInputElement} */ (this.querySelector('input[name="poll-title"]'))?.focus(),
            false,
        );
    }

    renderModal() {
        return tplPollModal(this);
    }

    renderModalFooter() {
        return html`<div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('Cancel')}</button>
            <button type="submit" class="btn btn-primary" form="isacloud-poll-form" ?disabled=${!this.isValid()}>
                ${t('Create')}
            </button>
        </div>`;
    }

    getModalTitle() {
        return t('Create poll');
    }

    /**
     * @returns {string[]}
     */
    getOptions() {
        return this.state.get('options') ?? ['', ''];
    }

    /**
     * @returns {boolean}
     */
    isValid() {
        const title = /** @type {string} */ (this.state.get('poll_title') ?? '').trim();
        const options = this.getOptions()
            .map((option) => option.trim())
            .filter(Boolean);
        return !!title && options.length >= 2;
    }

    /**
     * @param {number} index
     * @param {string} value
     */
    updateOption(index, value) {
        const options = [...this.getOptions()];
        options[index] = value;
        this.state.set('options', options);
    }

    addOption() {
        const options = this.getOptions();
        if (options.length >= MAX_OPTIONS) return;
        this.state.set('options', [...options, '']);
    }

    /**
     * @param {number} index
     */
    removeOption(index) {
        const options = this.getOptions();
        if (options.length <= 2) return;
        this.state.set(
            'options',
            options.filter((_, i) => i !== index),
        );
    }

    /**
     * @param {SubmitEvent} ev
     */
    onSubmit(ev) {
        ev.preventDefault();
        if (!this.isValid()) {
            this.alert(t('Fill in the question and at least two options.'), 'danger', false);
            return;
        }

        const labels = this.getOptions()
            .map((option) => option.trim())
            .filter(Boolean);
        const poll = {
            title: /** @type {string} */ (this.state.get('poll_title')).trim(),
            description: /** @type {string} */ (this.state.get('poll_description') ?? '').trim() || undefined,
            allow_multiple: !!this.state.get('allow_multiple'),
            hide_results: !!this.state.get('hide_results'),
            options: labels.map((label, index) => ({ emoji: OPTION_EMOJIS[index], label })),
        };
        this.modal.hide();
        createPoll(this.model, poll);
    }
}

api.elements.define('converse-isacloud-poll-modal', PollModal);

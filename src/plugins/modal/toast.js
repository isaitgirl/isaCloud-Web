import { html } from 'lit';
import { api } from '@converse/headless';
import { __ } from 'i18n';
import { CustomElement } from 'shared/components/element.js';
import './styles/toast.scss';

export default class Toast extends CustomElement {
    static get properties() {
        return {
            type: { type: String },
            name: { type: String },
            title: { type: String },
            body: { type: String },
            action: { type: Object, attribute: false },
            placement: { type: String },
            appearance: { type: String },
        };
    }

    constructor() {
        super();
        this.name = '';
        this.body = '';
        this.header = '';
        this.type = 'info';
        this.action = null;
        this.placement = 'top';
        this.appearance = 'default';
    }

    connectedCallback() {
        super.connectedCallback();
        this.onResize = () => this.placement === 'composer' && this.positionAboveComposer();
        window.addEventListener('resize', this.onResize);
    }

    disconnectedCallback() {
        window.removeEventListener('resize', this.onResize);
        super.disconnectedCallback();
    }

    /**
     * @param {import('lit').PropertyValues} changed
     */
    updated(changed) {
        if (changed.get('type') !== 'danger') {
            this.timeoutId = setTimeout(() => this.hide(), 5000);
        } else {
            clearTimeout(this.timeoutId);
        }
        if (this.placement === 'composer') this.positionAboveComposer();
    }

    /**
     * Keep the toast just above the visible composer, even when the composer
     * grows with a draft or a reply preview. `placement: "composer"` is used by
     * notices that belong to the conversation being typed in.
     */
    positionAboveComposer() {
        const form = [...document.querySelectorAll('.chat-message-form')].find(
            (el) => el.getBoundingClientRect().height > 0 && !el.closest('.hidden'),
        );
        if (!form) return;
        const rect = form.getBoundingClientRect();
        const card = form.closest('.chat-body') ?? form.closest('.box-flyout') ?? form;
        const card_rect = card.getBoundingClientRect();
        const bottom = Math.max(8, Math.round(window.innerHeight - rect.top + 8));
        const left = Math.max(8, Math.round(card_rect.left + 8));
        const width = Math.round(Math.min(480, Math.max(0, card_rect.width - 16)));
        this.style.setProperty('--toast-bottom', `${bottom}px`);
        this.style.setProperty('--toast-left', `${left}px`);
        if (width > 0) this.style.setProperty('--toast-width', `${width}px`);
    }

    render() {
        return html`<div
            class="toast show text-bg-${this.type ?? 'info'} ${this.placement === 'composer' ? 'toast--composer' : ''} ${this.appearance === 'light' ? 'toast--light' : ''}"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
        >
            ${
                this.title
                    ? html`<div class="toast-header">
                          <img
                              src="${api.settings.get('assets_path')}/images/isacloud/icon-192.png"
                              class="rounded me-2"
                              alt="isaCloud"
                          />
                          <strong class="me-auto">${this.title ?? ''}</strong>
                          <button
                              @click="${this.hide}"
                              type="button"
                              class="btn-close"
                              aria-label="${__('Close')}"
                          ></button>
                      </div>`
                    : ''
            }
            ${
                this.body
                    ? html`<div class="d-flex justify-content-between toast-body__container">
                          <div class="toast-body">${this.body ?? ''}</div>
                          ${
                              this.action
                                  ? html`<button @click="${this.onActionClick}" type="button" class="toast-action">
                                        ${this.action.label}
                                    </button>`
                                  : ''
                          }
                          ${
                              !this.title
                                  ? html`<button
                                        @click="${this.hide}"
                                        type="button"
                                        class="btn centered"
                                        aria-label="${__('Close')}"
                                    >
                                        <converse-icon size="1em" class="fa fa-times"></converse-icon>
                                    </button>`
                                  : ''
                          }
                      </div>`
                    : ''
            }
        </div>`;
    }

    /**
     * Run the action's handler and then dismiss the toast.
     * @param {MouseEvent} ev
     */
    onActionClick(ev) {
        ev.preventDefault();
        this.action?.handler?.();
        this.hide();
    }

    /**
     * @param {MouseEvent} [ev]
     */
    hide(ev) {
        ev?.preventDefault();
        api.toast.remove(this.name);
    }
}

api.elements.define('converse-toast', Toast);

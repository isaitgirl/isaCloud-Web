import BaseModal from 'plugins/modal/modal.js';
import tplMUCDescription from '../templates/muc-description.js';
import tplMUCList from '../templates/muc-list.js';
import tplSpinner from 'templates/spinner.js';
import { __ } from 'i18n';
import { api, converse, log, u } from '@converse/headless';

const { Strophe, stx, sizzle } = converse.env;
const { getAttributes } = u;

/**
 * Insert groupchat info (based on returned #disco IQ stanza)
 * @param {HTMLElement} el - The HTML DOM element that contains the info.
 * @param {Element} stanza - The IQ stanza containing the groupchat info.
 */
function insertRoomInfo(el, stanza) {
    // All MUC features found here: https://xmpp.org/registrar/disco-features.html
    el.querySelector('.room-info__spinner')?.remove();
    el.querySelector('a.room-info').classList.add('selected');
    el.insertAdjacentElement(
        'beforeend',
        u.getElementFromTemplateResult(
            tplMUCDescription({
                'channels': !!api.settings.get('muc_list_all_services'),
                'jid': stanza.getAttribute('from'),
                'desc': sizzle('field[var="muc#roominfo_description"] value', stanza).shift()?.textContent,
                'occ': sizzle('field[var="muc#roominfo_occupants"] value', stanza).shift()?.textContent,
                'hidden': sizzle('feature[var="muc_hidden"]', stanza).length,
                'membersonly': sizzle('feature[var="muc_membersonly"]', stanza).length,
                'moderated': sizzle('feature[var="muc_moderated"]', stanza).length,
                'nonanonymous': sizzle('feature[var="muc_nonanonymous"]', stanza).length,
                'open': sizzle('feature[var="muc_open"]', stanza).length,
                'passwordprotected': sizzle('feature[var="muc_passwordprotected"]', stanza).length,
                'persistent': sizzle('feature[var="muc_persistent"]', stanza).length,
                'publicroom': sizzle('feature[var="muc_publicroom"]', stanza).length,
                'semianonymous': sizzle('feature[var="muc_semianonymous"]', stanza).length,
                'temporary': sizzle('feature[var="muc_temporary"]', stanza).length,
                'unmoderated': sizzle('feature[var="muc_unmoderated"]', stanza).length,
            }),
        ),
    );
}

/**
 * Show/hide extra information about a groupchat in a listing.
 * @param {Event} ev
 */
function toggleRoomInfo(ev) {
    const parent_el = u.ancestor(ev.target, '.room-item');
    const div_el = parent_el.querySelector('div.room-info');
    if (div_el) {
        u.slideIn(div_el).then(u.removeElement);
        parent_el.querySelector('a.room-info').classList.remove('selected');
    } else {
        if (parent_el.querySelector('.room-info__spinner')) return;
        parent_el.insertAdjacentElement(
            'beforeend',
            u.getElementFromTemplateResult(tplSpinner({ class: 'room-info__spinner' })),
        );
        api.disco
            .info(/** @type HTMLElement */ (ev.currentTarget).getAttribute('data-room-jid'), null)
            .then(/** @param {Element} stanza */ (stanza) => insertRoomInfo(parent_el, stanza))
            .catch(
                /** @param {Error} e */ (e) => {
                    log.error(e);
                    parent_el.querySelector('.room-info__spinner')?.remove();
                },
            );
    }
}

class MUCListModal extends BaseModal {
    /**
     * @typedef {import('shared/types').EventWithInputTarget} EventWithInputTarget
     */

    constructor(/** @type {import('@converse/skeletor').ModelOptions} */ options) {
        super(options);
        this.items = [];
        this.loading_items = false;
        this.show_service = false;
    }

    initialize() {
        super.initialize();
        this.listenTo(this.model, 'change:muc_domain', this.onDomainChange);
        this.listenTo(this.model, 'change:feedback_text', () => this.requestUpdate());

        this.addEventListener('shown.bs.modal', () => {
            if (api.settings.get('muc_list_all_services')) {
                this.listAllServices();
            } else if (api.settings.get('locked_muc_domain')) {
                this.updateRoomsList();
            }
        });

        this.model.save('feedback_text', '');
    }

    renderModal() {
        return tplMUCList(
            Object.assign(this.model.toJSON(), {
                'show_service': !!this.show_service,
                'channels': !!api.settings.get('muc_list_all_services'),
                'show_form': !api.settings.get('locked_muc_domain') && !api.settings.get('muc_list_all_services'),
                'server_placeholder': this.model.get('muc_domain') || __('conference.example.org'),
                'items': this.items,
                'loading_items': this.loading_items,
                'openRoom': (/** @type {MouseEvent} */ ev) => this.openRoom(ev),
                'setDomainFromEvent': (/** @type {EventWithInputTarget} */ ev) => this.setDomainFromEvent(ev),
                'submitForm': (/** @type {Event} */ ev) => this.showRooms(ev),
                'toggleRoomInfo': (/** @type {MouseEvent} */ ev) => this.toggleRoomInfo(ev),
            }),
        );
    }

    getModalTitle() {
        // With every service listed, the list holds the public groupchats:
        // the channels. Groups are members-only and don't show up.
        return api.settings.get('muc_list_all_services') ? __('Search channels') : __('Query for Groupchats');
    }

    /**
     * Lists the groupchats of every groupchat service at once, sorted by
     * name, with the service of each one shown under it.
     * Used when `muc_list_all_services` is set.
     */
    async listAllServices() {
        this.loading_items = true;
        this.show_service = true;
        this.items = [];
        this.model.set({ 'feedback_text': '' }, { 'silent': true });
        this.requestUpdate();

        const services = await u.muc.getMUCServices().catch((e) => {
            log.error(e);
            return [];
        });
        const results = await Promise.all(services.map((service) => this.queryService(service)));
        const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
        const items = results
            .flat()
            .sort((a, b) => collator.compare(a.name || a.jid, b.name || b.jid) || collator.compare(a.jid, b.jid));
        this.onItemsFound(items);
    }

    /**
     * @param {string} service
     * @returns {Promise<Record<string, string>[]>}
     */
    async queryService(service) {
        const iq = stx`
            <iq to="${service}" type="get" xmlns="jabber:client">
                <query xmlns="${Strophe.NS.DISCO_ITEMS}"></query>
            </iq>`;
        try {
            const result = await api.sendIQ(iq);
            return sizzle('query item', result).map((el) => ({ ...getAttributes(el), service }));
        } catch (e) {
            log.warn(`Could not list the groupchats of ${service}`);
            return [];
        }
    }

    /**
     * @param {Record<string, string>[]} items
     */
    onItemsFound(items) {
        this.loading_items = false;
        this.items = items;
        const feedback_text = api.settings.get('muc_list_all_services')
            ? items.length
                ? __('Channels found')
                : __('No channels found')
            : items.length
              ? __('Groupchats found')
              : __('No groupchats found');
        this.model.set({ feedback_text }, { 'silent': true });
        this.requestUpdate();
    }

    /**
     * @param {MouseEvent} ev
     */
    openRoom(ev) {
        ev.preventDefault();
        const el = /** @type {Element} */ (ev.currentTarget);
        const jid = el.getAttribute('data-room-jid');
        const name = el.getAttribute('data-room-name');
        this.modal.hide();
        api.trigger('openConversation', { view: 'room', jid, attrs: { name } });
    }

    /**
     * @param {MouseEvent} ev
     */
    toggleRoomInfo(ev) {
        ev.preventDefault();
        toggleRoomInfo(ev);
    }

    onDomainChange() {
        if (api.settings.get('auto_list_rooms')) this.updateRoomsList();
    }

    /**
     * Handle the IQ stanza returned from the server, containing
     * all its public groupchats.
     * @method _converse.ChatRoomView#onRoomsFound
     * @param {Element} [iq]
     */
    onRoomsFound(iq) {
        this.show_service = false;
        this.onItemsFound(iq ? sizzle('query item', iq).map(getAttributes) : []);
        return true;
    }

    /**
     * Send an IQ stanza to the server asking for all groupchats
     * @private
     * @method _converse.ChatRoomView#updateRoomsList
     */
    updateRoomsList() {
        const iq = stx`
            <iq to="${this.model.get('muc_domain')}"
                from="${api.connection.get().jid}"
                type="get"
                xmlns="jabber:client">
                <query xmlns="${Strophe.NS.DISCO_ITEMS}"></query>
            </iq>`;
        api.sendIQ(iq)
            .then(/** @param {Element} iq */ (iq) => this.onRoomsFound(iq))
            .catch(() => this.onRoomsFound());
    }

    showRooms(/** @type {Event} */ ev) {
        ev.preventDefault();
        this.loading_items = true;
        this.requestUpdate();

        const data = new FormData(/** @type {HTMLFormElement} */ (ev.target));
        this.model.setDomain(data.get('server'));
        this.updateRoomsList();
    }

    /** @param {EventWithInputTarget} ev */
    setDomainFromEvent(ev) {
        this.model.setDomain(ev.target.value);
    }
    /** @param {EventWithInputTarget} ev */
    setNick(ev) {
        this.model.save({ nick: ev.target.value });
    }
}

api.elements.define('converse-muc-list-modal', MUCListModal);

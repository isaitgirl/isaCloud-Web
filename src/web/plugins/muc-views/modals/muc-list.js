import BaseModal from 'plugins/modal/modal.js';
import tplMUCList from '../templates/muc-list.js';
import { __ } from 'i18n';
import { api, converse, log, u } from '@converse/headless';

const { sizzle } = converse.env;
const { getAttributes } = u;

class MUCListModal extends BaseModal {
    /**
     * @typedef {import('shared/types').EventWithInputTarget} EventWithInputTarget
     */

    constructor(/** @type {import('@converse/skeletor').ModelOptions} */ options) {
        super(options);
        this.items = [];
        this.loading_items = false;
        /**
         * Expanded groupchat info, keyed by groupchat JID.
         * `null` means the info is still being fetched.
         * @type {Map<string, import('@converse/headless').MUCRoomInfo|null>}
         */
        this.room_info = new Map();
        this.show_service = false;
    }

    initialize() {
        super.initialize();
        this.listenTo(this.model, 'change:muc_domain', this.onDomainChange);
        this.listenTo(this.model, 'change:feedback_text', () => this.requestUpdate());

        this.addEventListener('shown.bs.modal', () => {
            // isaCloud: list the groupchats of every service at once.
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
                'room_info': this.room_info,
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
        try {
            const result = await api.disco.items(service);
            return sizzle('query item', result).map((el) => ({ ...getAttributes(el), service }));
        } catch {
            log.warn(`Could not list the groupchats of ${service}`);
            return [];
        }
    }

    /**
     * @param {Record<string, string>[]} items
     */
    onItemsFound(items) {
        this.loading_items = false;
        this.room_info.clear();
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
     * Show or hide extra information about a groupchat in the listing.
     * @param {MouseEvent} ev
     */
    async toggleRoomInfo(ev) {
        ev.preventDefault();
        const jid = /** @type {Element} */ (ev.currentTarget).getAttribute('data-room-jid');
        if (this.room_info.has(jid)) {
            this.room_info.delete(jid);
            this.requestUpdate();
            return;
        }
        this.room_info.set(jid, null);
        this.requestUpdate();
        try {
            const info = await api.rooms.info(jid);
            if (this.room_info.has(jid)) this.room_info.set(jid, info);
        } catch (e) {
            log.error(e);
            this.room_info.delete(jid);
        }
        this.requestUpdate();
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
        api.disco
            .items(this.model.get('muc_domain'))
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

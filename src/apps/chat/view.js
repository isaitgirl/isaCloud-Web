import { api, u, _converse, constants } from '@converse/headless';
import { CustomElement } from 'shared/components/element.js';
import { HashRouter, appOfHash } from 'plugins/rootview/routing.js';
import { isWaitingXMPPLink } from 'plugins/rootview/protocol-handler.js';
import { CHAT_ROUTE_ROOT, buildChatRoute, parseChatRoute } from './routing.js';
import tplChats from './templates/chats.js';

const { PRIVATE_CHAT_TYPE, CHATROOMS_TYPE, CONTROLBOX_TYPE } = constants;

/**
 * JIDs that the user (or an `xmpp:` link) explicitly opened since boot.
 *
 * The boot-time empty-state hide runs once to hide the conversations restored
 * from the previous session. A conversation opened by a link can be created
 * before that hide runs (the app may mount late, or the fetch promise may
 * resolve in a later microtask), and must not be hidden: it is the reason the
 * page was opened.
 * @type {Set<string>}
 */
const user_opened = new Set();

/**
 * @param {string} [jid]
 */
export function markUserOpened(jid) {
    if (jid) user_opened.add(jid.toLowerCase());
}

export function clearUserOpened() {
    user_opened.clear();
}

/**
 * The Chat app container. Renders the open chatboxes and, when
 * `enable_url_routing` is on and the view mode is `fullscreen`, keeps
 * `location.hash` in sync with the foregrounded conversation.
 *
 * Routing is bidirectional but non-looping:
 *  - hash -> foreground: `syncFromHash` -> `applyRoute` opens/backgrounds a box.
 *  - foreground -> hash: `syncHashToForeground` mirrors the open conversation with
 *    `replaceState` (no history entry, no `hashchange`, so it can't re-enter).
 *
 * A history entry (Back/Forward between conversations) is pushed only by a
 * user-initiated open via {@link ChatApp#navigate} (see ./navigation.js), never by
 * this mirror, so programmatic opens (boot auto-join, reconnection) don't spam the
 * back stack.
 */
class ChatApp extends CustomElement {
    #restored_hidden = false;

    constructor() {
        super();
        this.router = new HashRouter({ root: CHAT_ROUTE_ROOT, onRoute: () => this.syncFromHash() });

        // True while applyRoute is opening/backgrounding boxes, so the foreground
        // mirror stays quiet during the transition maybeShow makes across boxes.
        this._applying_route = false;
        this._foreground_scheduled = false;
    }

    initialize() {
        this.model = _converse.state.chatboxes;

        // The template sets the controlbox's `logged-out` class, which is
        // only known once start-up is done.
        api.waitUntil('initialized').then(() => this.requestUpdate());

        const onBoxesChanged = () => {
            this.requestUpdate();
            this.scheduleForegroundReflect();
        };
        this.listenTo(this.model, 'add', onBoxesChanged);
        this.listenTo(this.model, 'change:closed', onBoxesChanged);
        this.listenTo(this.model, 'change:hidden', onBoxesChanged);
        this.listenTo(this.model, 'change:jid', onBoxesChanged);
        this.listenTo(this.model, 'destroy', onBoxesChanged);
        this.listenTo(this.model, 'remove', onBoxesChanged);

        // Use listenTo instead of api.listen.to so that event handlers
        // automatically get deregistered when the component is dismounted
        this.listenTo(_converse, 'connected', () => this.requestUpdate());
        this.listenTo(_converse, 'reconnected', () => this.requestUpdate());
        this.listenTo(_converse, 'disconnected', () => this.requestUpdate());
        this.listenTo(_converse, 'clearSession', () => {
            // A new login is a new boot: restored conversations should be hidden
            // again, and links opened in the previous session must not exempt any
            // JID from it.
            this.#restored_hidden = false;
            clearUserOpened();
        });

        const settings = api.settings.get();
        this.listenTo(settings, 'change:view_mode', () => this.requestUpdate());
        this.listenTo(settings, 'change:singleton', () => this.requestUpdate());

        const body = document.querySelector('body');
        body.classList.add(`converse-${api.settings.get('view_mode')}`);

        // A deployment can open on its empty state instead of the conversation left open
        // in the previous session. The fetch promise resolves once per page session, so
        // the listener covers a logout/login without a reload, and the wait covers the
        // case where the fetch finished before this view mounted. Reconnects don't refetch.
        if (!api.settings.get('open_last_conversation')) {
            this.listenTo(_converse, 'chatBoxesFetched', () => this.#hideRestoredConversations());
            api.waitUntil('chatBoxesFetched').then(() => this.#hideRestoredConversations());
        }

        /**
         * Triggered once the ChatBoxViews view-collection has been initialized
         * @event _converse#chatBoxViewsInitialized
         * @example _converse.api.listen.on('chatBoxViewsInitialized', () => { ... });
         */
        api.trigger('chatBoxViewsInitialized');
    }

    /**
     * Hide every restored conversation, so the app opens on its empty state. This is not
     * destructive: the boxes stay in the collection with their drafts and place in the list.
     */
    hideVisibleConversations() {
        this.model
            .filter((c) => c.get('type') !== CONTROLBOX_TYPE && !c.get('hidden') && !c.get('closed'))
            .forEach((c) => u.safeSave(c, { hidden: true }));
    }

    /**
     * The boot-time empty-state hide. Runs once per login and leaves alone the
     * conversations the user explicitly opened before it — a channel from an
     * `xmpp:` link, for example, which may be created while this hide is still
     * waiting for its turn.
     */
    #hideRestoredConversations() {
        if (this.#restored_hidden) return;
        this.#restored_hidden = true;

        this.model
            .filter(
                (c) =>
                    c.get('type') !== CONTROLBOX_TYPE &&
                    !c.get('hidden') &&
                    !c.get('closed') &&
                    !user_opened.has(c.get('jid')?.toLowerCase()),
            )
            .forEach((c) => u.safeSave(c, { hidden: true }));
    }

    connectedCallback() {
        super.connectedCallback();
        this.router.start();
    }

    disconnectedCallback() {
        this.router.stop();
        super.disconnectedCallback();
    }

    render() {
        return tplChats();
    }

    /**
     * Push a history entry for a user-initiated conversation open, so browser
     * Back/Forward walks the stack of opened conversations. The resulting
     * `hashchange` drives `applyRoute`.
     * @param {import('./types.ts').ChatRoute} route
     */
    navigate(route) {
        this.router.navigate(buildChatRoute(route));
    }

    /**
     * Derive the open conversation from the current hash. A hash that isn't a
     * Chat route (empty, or another app's route such as `#converse/social`) is ignored.
     */
    syncFromHash() {
        const route = parseChatRoute(location.hash);
        if (route) this.applyRoute(route);
    }

    /**
     * The single place the open conversation is set from a route. Gated on
     * fullscreen (in overlayed mode several boxes are open at once, so "the
     * foreground conversation" is ill-defined and this router stays dormant).
     * @param {import('./types.ts').ChatRoute} route
     */
    async applyRoute(route) {
        if (api.settings.get('view_mode') !== 'fullscreen') return;

        this._applying_route = true;
        try {
            if (route.view === 'chat') {
                await api.chats.open(route.jid, {}, true);
            } else if (route.view === 'room') {
                // Don't race auto-join on a cold deep-link.
                await api.waitUntil('roomsAutoJoined');
                if (api.settings.get('allow_bookmarks')) await api.waitUntil('bookmarksInitialized');
                await api.rooms.open(route.jid, {}, true);
            } else {
                this.model
                    .filter((c) => c.get('type') !== CONTROLBOX_TYPE && !c.get('hidden') && !c.get('closed'))
                    .forEach((c) => u.safeSave(c, { hidden: true }));
            }
        } finally {
            this._applying_route = false;
        }
    }

    /**
     * The route mirroring the single foregrounded conversation, or the list when
     * none is shown. Only 1:1 chats and MUCs are routable; the controlbox and
     * headlines boxes are not.
     * @returns {import('./types.ts').ChatRoute}
     */
    currentForegroundRoute() {
        const box = this.model.find(
            (c) => [PRIVATE_CHAT_TYPE, CHATROOMS_TYPE].includes(c.get('type')) && !c.get('hidden') && !c.get('closed'),
        );
        if (!box) return { view: 'list' };
        return { view: box.get('type') === CHATROOMS_TYPE ? 'room' : 'chat', jid: box.get('jid') };
    }

    /**
     * Coalesce the foreground->hash mirror into one microtask, since maybeShow
     * flips `hidden` on several boxes in a single turn.
     */
    scheduleForegroundReflect() {
        if (this._foreground_scheduled) return;

        this._foreground_scheduled = true;
        queueMicrotask(() => {
            this._foreground_scheduled = false;
            this.syncHashToForeground();
        });
    }

    /**
     * Mirror the open conversation into `location.hash` via `replaceState`: no
     * history entry (that's `navigate`'s job) and no `hashchange` (so it can't
     * re-enter `syncFromHash`). A no-op unless routing is enabled and fullscreen,
     * while a route is being applied, or when the hash is already correct.
     */
    syncHashToForeground() {
        if (!this.router.enabled || api.settings.get('view_mode') !== 'fullscreen') return;
        if (this._applying_route) return;

        // Never clobber an `xmpp:` link still waiting for login to be handled,
        // nor another app's route (e.g. `#converse/social` during the boot
        // window before the app-switcher unmounts us).
        if (isWaitingXMPPLink()) return;

        const owner = appOfHash(location.hash);
        if (owner && owner !== 'chat') return;

        const hash = buildChatRoute(this.currentForegroundRoute());
        if (!hash || hash === location.hash) return;

        this.router.replace(hash);
    }
}

api.elements.define('converse-app-chat', ChatApp);

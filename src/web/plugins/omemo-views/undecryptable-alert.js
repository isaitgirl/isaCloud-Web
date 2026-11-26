import { CustomElement } from 'shared/components/element.js';
import tplUndecryptableAlert from './templates/undecryptable-alert.js';

import './styles/undecryptable-alert.scss';

/**
 * Notice above the composer of a chat or groupchat, saying how many received
 * OMEMO messages could not be read on this device.
 *
 * The counts are kept on the chatbox by the headless `converse-omemo` plugin,
 * which also decides what they mean. This element only paints them and lets
 * the user acknowledge them.
 */
export default class OMEMOUndecryptableAlert extends CustomElement {
    static properties = {
        model: { type: Object },
    };

    constructor() {
        super();
        this.model = null;
    }

    initialize() {
        super.initialize();
        if (!this.model) return;
        this.listenTo(this.model, 'change:omemo_undecryptable', () => this.requestUpdate());
        this.requestUpdate();
    }

    /**
     * @returns {{ history: number, recent: number, total: number }|null} The
     *  counts, or null when there is nothing the user hasn't acknowledged yet.
     */
    getUnacknowledgedCounts() {
        const state = this.model?.get('omemo_undecryptable');
        if (!state) return null;
        const history = state.history?.length ?? 0;
        const recent = state.recent?.length ?? 0;
        const total = history + recent;
        if (total === 0 || total <= (state.dismissed_total ?? 0)) return null;
        return { history, recent, total };
    }

    render() {
        return tplUndecryptableAlert(this, this.getUnacknowledgedCounts());
    }

    /**
     * Acknowledges the failures counted so far. A later failure raises the
     * total above this and the notice comes back.
     * @param {MouseEvent} [ev]
     */
    dismiss(ev) {
        ev?.preventDefault?.();
        const state = this.model.get('omemo_undecryptable') || {};
        const total = (state.history?.length ?? 0) + (state.recent?.length ?? 0);
        this.model.save({ omemo_undecryptable: { ...state, dismissed_total: total } });
    }
}

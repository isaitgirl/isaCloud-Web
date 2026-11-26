import { html } from 'lit';

/**
 * Stop the browser from starting its own image drag, which would otherwise
 * take over the pointer while panning a zoomed image.
 * @param {DragEvent} ev
 */
const onDragStart = (ev) => ev.preventDefault();

export default /** @param {Record<string, any>} o */ (o) =>
    html`<img
        class="chat-image chat-image--modal ${o.zoomed ? 'chat-image--modal--zoomed' : ''}"
        src="${o.src}"
        draggable="false"
        @load=${o.onLoad}
        @click=${o.onClick}
        @pointerdown=${o.onPointerDown}
        @dragstart=${onDragStart}
    />`;

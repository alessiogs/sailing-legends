/**
 * Dragging the HUD's gauges with a finger or the mouse (pointer events, so both work the same). The tiller bar
 * (the Crew's weight bar) and the trim bar each take one pointer, so two fingers can work them at once. The
 * position along the bar goes to `Input`, which knows nothing of the HUD; letting go hands the control back.
 */
import type { Input } from "../core/Input";

/** What a drag needs of `Input`. */
type Draggable = Pick<Input, "dragGauge" | "dragSheet">;

/**
 * Makes `zone` (a larger area around `bar`) drag-sensitive: a press anywhere in it, and the moves that follow, give
 * the position along `bar` (0 = its left end, 1 = its right end) to `set`; releasing gives it `null`.
 */
function bindDrag(zone: HTMLElement, bar: HTMLElement, set: (position: number | null) => void) {
  let active: number | null = null;
  const at = (e: PointerEvent) => {
    const r = bar.getBoundingClientRect();
    return r.width > 0 ? (e.clientX - r.left) / r.width : 0;
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    set(null);
  };
  zone.addEventListener("pointerdown", e => {
    if (active !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    active = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    e.preventDefault();
    set(at(e));
  });
  zone.addEventListener("pointermove", e => {
    if (e.pointerId === active) set(at(e));
  });
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
  zone.addEventListener("lostpointercapture", release);
}

/** Wires the tiller / weight bar and the trim bar of the HUD to `input`. Call once, at startup. */
export function attachGaugeDrag(input: Draggable) {
  const $ = (id: string) => document.getElementById(id)!;
  bindDrag($("gauge-zone"), document.querySelector<HTMLElement>(".tiller-bar")!, p => input.dragGauge(p));
  bindDrag($("trim-zone"), document.querySelector<HTMLElement>(".trim-bar")!, p => input.dragSheet(p));
}

/**
 * Dragging the HUD's controls with a finger or the mouse (pointer events, so both work the same). The tiller bar
 * (the Crew's weight bar, horizontal) and the sheet slider (vertical, up = sheet in) each take one pointer, so two
 * thumbs can work them at once. The position along the track goes to `Input`, which knows nothing of the HUD;
 * letting go hands the control back.
 */
import type { Input } from "../core/Input";

/** What a drag needs of `Input`. */
type Draggable = Pick<Input, "dragGauge" | "dragSheet">;

/**
 * Makes `zone` (a larger area around `track`) drag-sensitive: a press anywhere in it, and the moves that follow, give
 * the position along `track` (0 = its left or top end, 1 = its right or bottom end) to `set`; releasing gives it `null`.
 */
function bindDrag(zone: HTMLElement, track: HTMLElement, axis: "x" | "y", set: (position: number | null) => void) {
  let active: number | null = null;
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    const [start, size, point] = axis === "x" ? [r.left, r.width, e.clientX] : [r.top, r.height, e.clientY];
    return size > 0 ? (point - start) / size : 0;
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

/** Wires the tiller / weight bar and the sheet slider of the HUD to `input`. Call once, at startup. */
export function attachGaugeDrag(input: Draggable) {
  const $ = (id: string) => document.getElementById(id)!;
  bindDrag($("gauge-zone"), $("tiller-track"), "x", p => input.dragGauge(p));
  bindDrag($("trim-zone"), $("trim-track"), "y", p => input.dragSheet(p));
}

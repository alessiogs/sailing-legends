/**
 * The tap buttons for the race actions that have only keys: pause, camera, Auto-trim, the spinnaker and the side
 * switch. They are in the page always and shown only on touch screens (`pointer: coarse`, in style.css); a tap
 * is the key's action, pressed through `Input`. The Auto-trim chip of the trim panel is tappable too.
 */
import type { Action, Input } from "../core/Input";
import { t, type MessageKey } from "../i18n";
import { h } from "./dom";

/** The buttons, in order: the action, the label, and what they need of the boat (`two` = a 420, `crew` = the player is Crew). */
const BUTTONS: { id: string; action: Action; label: MessageKey; only?: "two" | "crew" }[] = [
  { id: "touch-pause", action: "pause", label: "touch.pause" },
  { id: "touch-camera", action: "camera", label: "touch.camera" },
  { id: "touch-auto-trim", action: "autoTrim", label: "touch.autoTrim" },
  { id: "touch-spi", action: "spi", label: "touch.spinnaker", only: "two" },
  { id: "touch-switch", action: "switch", label: "touch.switchSide", only: "crew" },
];

/** Fills the `#touch-actions` container of the HUD with the buttons and makes the Auto-trim chip tappable. */
export function attachTouchButtons(input: Pick<Input, "press">) {
  const container = document.getElementById("touch-actions")!;
  container.replaceChildren(...BUTTONS.map(b => {
    const button = h("button", { id: b.id, type: "button", class: `touch-btn${b.only ? ` only-${b.only}` : ""}` }, t(b.label));
    // pointerdown, not click: a thumb on a moving boat should not wait for the finger to lift.
    button.addEventListener("pointerdown", e => { e.preventDefault(); input.press(b.action); });
    return button;
  }));
  document.getElementById("auto-trim-chip")!.addEventListener("pointerdown", e => { e.preventDefault(); input.press("autoTrim"); });
}

/** Shows the buttons the boat has: the spinnaker in a 420, the side switch when the player is its Crew. */
export function showTouchButtons(twoPerson: boolean, crew: boolean) {
  const container = document.getElementById("touch-actions")!;
  container.classList.toggle("two", twoPerson);
  container.classList.toggle("crew", twoPerson && crew);
}

/** Shows whether Auto-trim is on in its button. */
export function showTouchAutoTrim(on: boolean) {
  document.getElementById("touch-actions")!.classList.toggle("autotrim", on);
}

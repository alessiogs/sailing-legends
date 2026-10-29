/**
 * The HUD's tap buttons for the race actions that have keys: pause, camera, Auto-trim, the spinnaker and the side
 * switch. They are in the page (`index.html`, every one with a `data-action`) and a tap or click is the key's action,
 * pressed through `Input`. The context buttons (Auto-trim, spinnaker, side switch) show only when they apply to the boat.
 */
import type { Action, Input } from "../core/Input";

/** Makes every `[data-action]` button of the HUD press its action. */
export function attachTouchButtons(input: Pick<Input, "press">) {
  for (const button of Array.from(document.querySelectorAll<HTMLElement>("#hud [data-action]"))) {
    const action = button.dataset.action as Action;
    // pointerdown, not click: a thumb on a moving boat should not wait for the finger to lift.
    button.addEventListener("pointerdown", e => { e.preventDefault(); input.press(action); });
  }
}

/** Shows the buttons the boat has: the spinnaker in a 420, the side switch when the player is its Crew. */
export function showTouchButtons(twoPerson: boolean, crew: boolean) {
  const container = document.getElementById("context-buttons")!;
  container.classList.toggle("two", twoPerson);
  container.classList.toggle("crew", twoPerson && crew);
}

/** Shows whether Auto-trim is on in its button. */
export function showTouchAutoTrim(on: boolean) {
  document.getElementById("touch-auto-trim")!.classList.toggle("on", on);
}

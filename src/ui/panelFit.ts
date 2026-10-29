/**
 * Keeps the Standings/map panel clear of the controls under it. The panel sits in a column with the messages and status
 * pills above it, and their length changes with the wording and the language; when the column runs into a control
 * (the tiller, the trim pill, the sheet slider, a button), the panel gives up its least useful parts, in order: its
 * lines, the map, the standings rows after the first three (the player's row stays), the wind and heel readings,
 * and at last the whole panel, until the messages go. The HUD never overlaps itself, whatever the messages say. Works on the page's own boxes (`data-hud`).
 */

/** The class a part gets while it is trimmed away (`display: none` in style.css). */
const TRIMMED = "trimmed";

/** Trims the panel until its bottom is above every control below it, or nothing is left to trim. */
export function fitPanel(panel: HTMLElement) {
  for (const el of [panel, ...Array.from(panel.querySelectorAll(`.${TRIMMED}`))]) el.classList.remove(TRIMMED);
  if (panel.classList.contains("hidden")) return;

  /** The lowest the panel's bottom may be: just above the first box below it that shares its columns, else the screen's edge. */
  const limit = () => {
    const mine = panel.getBoundingClientRect();
    let bottom = window.innerHeight - 8;
    for (const other of Array.from(document.querySelectorAll<HTMLElement>("#hud [data-hud]"))) {
      if (other === panel) continue;
      const r = other.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < mine.right && r.right > mine.left && r.top >= mine.top) bottom = Math.min(bottom, r.top - 8);
    }
    return bottom;
  };
  const tooLow = () => panel.getBoundingClientRect().bottom > limit();
  const trim = (...els: Element[]) => {
    for (const el of els) {
      if (!tooLow()) return;
      el.classList.add(TRIMMED);
    }
  };

  trim(...Array.from(panel.querySelectorAll(".panel-line")));
  trim(...Array.from(panel.querySelectorAll("#minimap")));
  const rows = Array.from(panel.querySelectorAll("#standings li")).filter(li => !li.classList.contains("me"));
  trim(...rows.slice(3).reverse());
  trim(...Array.from(panel.querySelectorAll(".panel-stats")));
  // Nothing left to trim and still no room (messages fill the column): the panel steps aside until they go.
  trim(panel);
}

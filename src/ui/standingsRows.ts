/**
 * Which boats the HUD's standings list shows. A fleet that fits shows all of it; a bigger one (a Career fleet has
 * up to 12 boats) shows the first three, then the boats around the player, so the panel stays short on a phone and
 * the player's own place is always in it. Pure: it works on positions, the HUD words them.
 */

/** The most rows the list shows. */
export const MAX_STANDINGS_ROWS = 8;

/** The positions (0 = first) of the boats to show, in order, for a fleet of `boats` boats with the player at `player`. */
export function standingsRows(boats: number, player: number, max = MAX_STANDINGS_ROWS): number[] {
  if (boats <= max) return Array.from({ length: boats }, (_, i) => i);
  const top = 3;
  const around = max - top;
  // The window of `around` boats centred on the player, kept inside the places after the top three.
  const first = Math.max(top, Math.min(boats - around, player - Math.floor((around - 1) / 2)));
  return [...Array.from({ length: top }, (_, i) => i), ...Array.from({ length: around }, (_, i) => first + i)];
}

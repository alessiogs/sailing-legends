/** Which boats the HUD's standings list shows: a whole small fleet, else the first three and the boats around the player. */
import { describe, expect, it } from "vitest";
import { MAX_STANDINGS_ROWS, standingsRows } from "../src/ui/standingsRows";

describe("standings rows", () => {
  it("shows a fleet that fits whole", () => {
    expect(standingsRows(4, 2)).toEqual([0, 1, 2, 3]);
    expect(standingsRows(MAX_STANDINGS_ROWS, 5)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows the first three and the boats around the player in a bigger fleet", () => {
    expect(standingsRows(12, 8)).toEqual([0, 1, 2, 6, 7, 8, 9, 10]);
    expect(standingsRows(12, 5)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the window inside the fleet at its ends", () => {
    expect(standingsRows(12, 11)).toEqual([0, 1, 2, 7, 8, 9, 10, 11]);
    expect(standingsRows(12, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("always includes the player and never more than the most rows", () => {
    for (let boats = 1; boats <= 14; boats++) {
      for (let player = 0; player < boats; player++) {
        const rows = standingsRows(boats, player);
        expect(rows.includes(player)).toBe(true);
        expect(rows.length <= MAX_STANDINGS_ROWS).toBe(true);
        expect(rows.every((r, i) => i === 0 || r > rows[i - 1])).toBe(true);
      }
    }
  });
});

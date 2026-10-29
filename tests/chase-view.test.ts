/** The chase camera's distance and height for the screen's shape: farther and higher on a portrait phone. */
import { describe, expect, it } from "vitest";
import { CHASE_BETA, chasePullBack, chaseView, portraitness } from "../src/game/chaseView";

describe("chase view", () => {
  it("is the landscape view on a screen as wide as it is tall or wider", () => {
    expect(chaseView(false, 1)).toEqual({ radius: 12, beta: CHASE_BETA });
    expect(chaseView(true, 16 / 9)).toEqual({ radius: 17, beta: CHASE_BETA });
  });

  it("pulls back and up on a portrait phone", () => {
    const phone = chaseView(false, 390 / 844), flat = chaseView(false, 16 / 9);
    expect(phone.radius).toBeGreaterThan(flat.radius * 1.3);
    expect(phone.beta).toBeLessThan(flat.beta);
    expect(chaseView(true, 390 / 844).radius).toBeGreaterThan(chaseView(false, 390 / 844).radius);
  });

  it("grows smoothly with how tall the screen is, and no further than a very tall one", () => {
    const pulls = [1, 0.9, 0.75, 0.6, 0.46, 0.3, 0.1].map(chasePullBack);
    expect(pulls.every((p, i) => i === 0 || p >= pulls[i - 1])).toBe(true);
    expect(portraitness(0.01)).toBe(1);
    expect(portraitness(2)).toBe(0);
  });
});

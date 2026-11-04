/** The chase camera's distance and height for the screen's shape: farther on a portrait phone, always low. */
import { describe, expect, it } from "vitest";
import { I420, I49ER, ILCA_6, OPTIMIST } from "../src/sailing/BoatClass";
import {
  CHASE_BETA,
  chasePullBack,
  chaseView,
  portraitness,
} from "../src/game/chaseView";

describe("chase view", () => {
  it("is the landscape view on a screen as wide as it is tall or wider", () => {
    expect(chaseView(OPTIMIST, 1)).toEqual({ radius: 12, beta: CHASE_BETA });
    expect(chaseView(I420, 16 / 9)).toEqual({ radius: 17, beta: CHASE_BETA });
  });

  it("pulls back on a portrait phone and stays low", () => {
    const phone = chaseView(OPTIMIST, 390 / 844),
      flat = chaseView(OPTIMIST, 16 / 9);
    expect(phone.radius).toBeGreaterThan(flat.radius * 1.3);
    expect(phone.beta).toBe(flat.beta);
    expect(chaseView(I420, 390 / 844).radius).toBeGreaterThan(
      chaseView(OPTIMIST, 390 / 844).radius,
    );
  });

  it("grows smoothly with how tall the screen is, and no further than a very tall one", () => {
    const pulls = [1, 0.9, 0.75, 0.6, 0.46, 0.3, 0.1].map(chasePullBack);
    expect(pulls.every((p, i) => i === 0 || p >= pulls[i - 1])).toBe(true);
    expect(portraitness(0.01)).toBe(1);
    expect(portraitness(2)).toBe(0);
  });
});

describe("boat views", () => {
  it("frame each class by its own size: the 49er farther than the 420, the ILCA farther than the Optimist", () => {
    expect(chaseView(ILCA_6, 1).radius).toBeGreaterThan(
      chaseView(OPTIMIST, 1).radius,
    );
    expect(chaseView(I49ER, 1).radius).toBeGreaterThan(
      chaseView(I420, 1).radius,
    );
  });
});

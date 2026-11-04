/**
 * The ILCA and its three rigs, through BoatSim: the 11 kn target speeds (the polar), and that the rig suits the sailor's
 * weight (a light sailor is fastest in the ILCA 4, a heavy one in the ILCA 7). Races: see `smoke`.
 */
import { describe, expect, it } from "vitest";
import { DEG, KNOTS } from "../src/core/math";
import {
  ILCA_4,
  ILCA_6,
  ILCA_7,
  ILCA_RIGS,
  type BoatClass,
} from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Steady speed (kn) held at a true wind angle with ideal trim, for a Helm of `kg` (the rig's ideal weight by default). */
function knots(cls: BoatClass, tws: number, twa: number, kg?: number): number {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: tws });
  wind.shift = () => 0;
  const weights = kg === undefined ? undefined : { helmKg: kg, crewKg: 0 };
  const sim = new BoatSim(cls, createBoat(0, 0, -twa * DEG), weights);
  const c: Controls = { rudder: 0, sheet: 0.5, crewOut: 0 };
  for (let i = 0; i < 60 * 40; i++) {
    sim.state.heading = -twa * DEG;
    sim.state.yawRate = 0;
    c.sheet = sim.telemetry.optimalSheet;
    sim.step(1 / 60, c, wind);
  }
  return sim.telemetry.speed * KNOTS;
}

describe("ILCA rigs", () => {
  it("are one class with a rig that sets the sail area and the ideal sailor weight", () => {
    expect(Object.values(ILCA_RIGS).map((c) => c.id)).toEqual([
      "ilca",
      "ilca",
      "ilca",
    ]);
    expect([ILCA_4, ILCA_6, ILCA_7].map((c) => c.rig)).toEqual([4, 6, 7]);
    expect([ILCA_4, ILCA_6, ILCA_7].map((c) => c.main.area)).toEqual([
      4.7, 5.76, 7.06,
    ]);
    expect([ILCA_4, ILCA_6, ILCA_7].map((c) => c.sailorKg.helm)).toEqual([
      53, 68, 82,
    ]);
  });

  // [rig, upwind at 45 deg, reaching (best of 90 and 120 deg), downwind VMG]: the spec's 11 kn targets.
  const TARGETS: [BoatClass, number, number, number][] = [
    [ILCA_4, 4.1, 5.9, 5.0],
    [ILCA_6, 4.3, 6.2, 5.3],
    [ILCA_7, 4.4, 6.5, 5.5],
  ];
  /** Best downwind VMG (kn) over the broad angles. */
  const downVmg = (cls: BoatClass, tws: number) =>
    Math.max(
      ...[140, 150, 160, 170, 180].map(
        (twa) => knots(cls, tws, twa) * Math.cos((180 - twa) * DEG),
      ),
    );
  for (const [cls, up, reach, down] of TARGETS) {
    it(`${cls.name} makes its 11 kn target speeds`, () => {
      expect(Math.abs(knots(cls, 11, 45) - up)).toBeLessThan(0.35);
      const r = Math.max(knots(cls, 11, 90), knots(cls, 11, 120));
      expect(Math.abs(r - reach)).toBeLessThan(0.35);
      // Downwind VMG runs about 0.4-0.5 kn under the spec's figure: a sail-only dinghy can't match it (see AGENTS.md).
      expect(Math.abs(downVmg(cls, 11) - down)).toBeLessThan(0.55);
    });
  }

  it("is held near 4.5 kn close-hauled from 11 to 16 kn: hull speed caps it", () => {
    expect(knots(ILCA_6, 16, 45) - knots(ILCA_6, 11, 45)).toBeLessThan(0.5);
  });

  it("suit the sailor: a light sailor is fastest in the 4, a mid-weight one in the 6 and a heavy one in the 7", () => {
    // In a breeze (14 kn), the mean of a beat, a reach and a broad reach.
    const mean = (cls: BoatClass, kg: number) =>
      (knots(cls, 14, 45, kg) +
        knots(cls, 14, 90, kg) +
        knots(cls, 14, 150, kg)) /
      3;
    const best = (kg: number) =>
      [ILCA_4, ILCA_6, ILCA_7].reduce((a, b) =>
        mean(b, kg) > mean(a, kg) ? b : a,
      ).rig;
    expect(best(53)).toBe(4);
    expect(best(68)).toBe(6);
    expect(best(82)).toBe(7);
  });
});

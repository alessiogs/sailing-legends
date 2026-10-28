/**
 * The Crew's weight position and the spinnaker state, derived once from the boat state and worded through the
 * Italian catalog: every HUD line (the player's weight gauge, the Partner lines) reads them the same way.
 */
import { describe, expect, it } from "vitest";
import { crewWeight, spinnakerState } from "../src/sailing/BoatStates";
import { crewWeightText, spinnakerText } from "../src/ui/boatStateText";

describe("crew weight position", () => {
  it("is in up to 0.3, hiking up to 0.75, then on the trapeze", () => {
    expect(crewWeight(0)).toBe("in");
    expect(crewWeight(0.3)).toBe("in");
    expect(crewWeight(0.31)).toBe("hiking");
    expect(crewWeight(0.75)).toBe("hiking");
    expect(crewWeight(0.76)).toBe("trapeze");
    expect(crewWeight(1)).toBe("trapeze");
  });

  it("reads as the player's own weight gauge and as the Partner line", () => {
    expect(crewWeightText("in", "own")).toBe("seduto dentro");
    expect(crewWeightText("in", "partner")).toBe("dentro");
    for (const view of ["own", "partner"] as const) {
      expect(crewWeightText("hiking", view)).toBe("in cinghia");
      expect(crewWeightText("trapeze", view)).toBe("al trapezio");
    }
  });
});

describe("spinnaker state", () => {
  it("is down up to 0.05 hoisted, moving up to 0.9, then up", () => {
    expect(spinnakerState(0)).toBe("down");
    expect(spinnakerState(0.05)).toBe("down");
    expect(spinnakerState(0.06)).toBe("moving");
    expect(spinnakerState(0.9)).toBe("moving");
    expect(spinnakerState(0.91)).toBe("up");
    expect(spinnakerState(1)).toBe("up");
  });

  it("reads as the HUD shows it", () => {
    expect(spinnakerText("down")).toBe("giù");
    expect(spinnakerText("moving")).toBe("in manovra");
    expect(spinnakerText("up")).toBe("su");
  });
});

/**
 * The one Crew wrong-side check shared by the Crew AI, the browser autopilot and the HUD Partner call:
 * after a tack or gybe the Crew must move across once the bow is through the wind.
 */
import { describe, expect, it } from "vitest";
import { crewOnWrongSide } from "../src/ai/CrewAI";
import { DEG } from "../src/core/math";
import type { BoatState, Telemetry } from "../src/sailing/BoatPhysics";

type Sides = { backed?: boolean; onWindward?: boolean; spiWrong?: boolean; spiHoist?: number; awaDeg?: number };

/** A boat with just the fields the check reads. */
function boat({ backed = false, onWindward = true, spiWrong = false, spiHoist = 0, awaDeg = 45 }: Sides) {
  const state = { spiHoist } as BoatState;
  const telemetry = {
    awa: awaDeg * DEG,
    jib: { backed },
    spi: { wrongSide: spiWrong },
    crew: { onWindward },
  } as Telemetry;
  return { state, telemetry };
}

describe("crewOnWrongSide", () => {
  it("is false with everything on the right side", () => {
    expect(crewOnWrongSide(boat({}))).toBe(false);
  });

  it("is true with a backed jib, or the Crew to leeward, once the bow is through the wind", () => {
    expect(crewOnWrongSide(boat({ backed: true }))).toBe(true);
    expect(crewOnWrongSide(boat({ onWindward: false, awaDeg: -40 }))).toBe(true);
  });

  it("counts the spinnaker only while it is hoisted", () => {
    expect(crewOnWrongSide(boat({ spiWrong: true, spiHoist: 0.8 }))).toBe(true);
    expect(crewOnWrongSide(boat({ spiWrong: true, spiHoist: 0.3 }))).toBe(false);
  });

  it("waits until the apparent wind is more than 22 degrees off the bow", () => {
    expect(crewOnWrongSide(boat({ backed: true, awaDeg: 22 }))).toBe(false);
    expect(crewOnWrongSide(boat({ backed: true, awaDeg: -23 }))).toBe(true);
  });

  it("is false for a boat without a jib or Crew", () => {
    const { state, telemetry } = boat({});
    expect(crewOnWrongSide({ state, telemetry: { ...telemetry, jib: undefined, spi: undefined, crew: undefined } })).toBe(false);
  });
});

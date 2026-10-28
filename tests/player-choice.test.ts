/**
 * The player's choice: a Role (Helm or Crew) plus a Control mode (Player Career or Full Boat Control).
 * Full Boat Control exists only for the Helm, and each choice sets up the Partner as the game does today.
 */
import { describe, expect, it } from "vitest";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../src/race/PlayerChoice";
import { RaceSession } from "../src/race/RaceSession";
import { I420 } from "../src/sailing/BoatClass";

describe("player choice", () => {
  it("cannot express a Crew in Full Boat Control", () => {
    // @ts-expect-error Full Boat Control is only for the Helm.
    const invalid: PlayerChoice = { role: "crew", control: "fullBoat" };
    expect(invalid.role).toBe("crew");
  });

  it("gives the Helm a Partner Crew that decides the spinnaker", () => {
    const s = new RaceSession({ boatClass: I420, choice: HELM });
    expect([s.partnerHelm, s.partnerCrew?.spiMode]).toEqual([null, "auto"]);
  });

  it("gives Full Boat Control a Partner Crew that waits for the spinnaker call", () => {
    const s = new RaceSession({ boatClass: I420, choice: FULL_BOAT });
    expect([s.partnerHelm, s.partnerCrew?.spiMode]).toEqual([null, "command"]);
  });

  it("gives the Crew a Partner Helm", () => {
    const s = new RaceSession({ boatClass: I420, choice: CREW });
    expect([s.partnerHelm !== null, s.partnerCrew]).toEqual([true, null]);
  });

  it("sails the Helm in Player Career by default", () => {
    expect(new RaceSession({ boatClass: I420 }).choice).toEqual(HELM);
  });
});

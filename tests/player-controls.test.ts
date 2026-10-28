/**
 * The player's input turned into the player boat's controls, per Role and Control mode: steering, sheeting,
 * Crew weight, side switch, the spinnaker key, Auto-trim and the browser autopilot.
 */
import { describe, expect, it } from "vitest";
import { PlayerControls, type Assists, type PlayerInput } from "../src/game/PlayerControls";
import { t } from "../src/i18n";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../src/race/PlayerChoice";
import { makeFleet } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";
import { AUTOPILOT_HELM } from "../src/sailors/Sailors";

function setup(choice: PlayerChoice, boatClass: BoatClass = I420, autoTrim = false) {
  const session = new RaceSession({ seed: 7, fleet: makeFleet({ boatClass, choice }) });
  session.step(1 / 60); // fills the telemetry
  const input: PlayerInput = { role: choice.role, rudder: 0.4, sheet: 0.3, crewOut: 0.8 };
  const assists: Assists = { autoTrim };
  const controls = new PlayerControls(input, assists);
  return { session, input, assists, controls, pc: session.playerControls, p: session.player! };
}

describe("player controls", () => {
  it("lets the Helm steer and trim the mainsail", () => {
    const { session, controls, pc } = setup(HELM);
    controls.apply(1 / 60, session);
    expect([pc.rudder, pc.sheet]).toEqual([0.4, 0.3]);
  });

  it("trims the Helm's mainsail to the optimal sheet with Auto-trim", () => {
    const { session, controls, input, pc, p } = setup(HELM, I420, true);
    controls.apply(1 / 60, session);
    expect(input.sheet).toBe(p.sim.telemetry.optimalSheet);
    expect(pc.sheet).toBe(p.sim.telemetry.optimalSheet);
  });

  it("lets the Crew trim the jib and move their weight, leaving the helm to the Partner", () => {
    const { session, controls, pc } = setup(CREW);
    const before = [pc.rudder, pc.sheet];
    controls.apply(1 / 60, session);
    expect([pc.jibSheet, pc.spiSheet, pc.crewOut]).toEqual([0.3, 0.5, 0.8]);
    expect([pc.rudder, pc.sheet]).toEqual(before);
  });

  it("keeps each Crew sheet's trim when the spinnaker goes up and comes down", () => {
    const { session, controls, input, pc, p } = setup(CREW);
    controls.apply(1 / 60, session); // jib trimmed to 0.3
    p.sim.state.spiHoist = 1;
    controls.apply(1 / 60, session);
    expect(input.sheet).toBe(0.5); // the spinnaker sheet takes over where it was
    input.sheet = 0.7;
    controls.apply(1 / 60, session);
    p.sim.state.spiHoist = 0;
    controls.apply(1 / 60, session);
    expect(input.sheet).toBe(0.3);
    expect([pc.jibSheet, pc.spiSheet]).toEqual([0.3, 0.7]);
  });

  it("trims the Crew's sail to its optimal sheet with Auto-trim", () => {
    const { session, controls, pc, p } = setup(CREW, I420, true);
    controls.apply(1 / 60, session);
    expect(pc.jibSheet).toBe(p.sim.telemetry.jib!.optimal);
  });

  it("hands back the sheet where the sail is trimmed when Auto-trim is switched off", () => {
    const helm = setup(HELM);
    helm.controls.autoTrimOff(helm.session);
    expect(helm.input.sheet).toBe(helm.p.sim.state.sheet);
    const crew = setup(CREW);
    crew.controls.autoTrimOff(crew.session);
    expect(crew.input.sheet).toBe(0.5);
  });

  it("answers the spinnaker key per Role and Control mode", () => {
    expect(setup(HELM, OPTIMIST).controls.callSpinnaker(setup(HELM, OPTIMIST).session)).toBe(null);

    const crew = setup(CREW);
    expect(crew.controls.callSpinnaker(crew.session)).toBe(t("toast.spi.hoist"));
    expect(crew.pc.spi).toBe(true);
    expect(crew.controls.callSpinnaker(crew.session)).toBe(t("toast.spi.drop"));
    expect(crew.pc.spi).toBe(false);

    const full = setup(FULL_BOAT);
    expect(full.controls.callSpinnaker(full.session)).toBe(t("toast.spi.callHoist"));
    expect(full.session.partnerCrew!.spiCommand).toBe(true);
    expect(full.controls.callSpinnaker(full.session)).toBe(t("toast.spi.callDrop"));

    const helm = setup(HELM);
    expect(helm.controls.callSpinnaker(helm.session)).toBe(t("toast.spi.partnerDecides", { name: helm.session.partner!.name }));
    expect(helm.pc.spi).toBe(false);
  });

  it("switches sides only for the Crew", () => {
    const helm = setup(HELM);
    expect(helm.controls.switchSide(helm.session)).toBe(false);
    expect(helm.pc.switchSide).toBe(undefined);
    const crew = setup(CREW);
    expect(crew.controls.switchSide(crew.session)).toBe(true);
    expect(crew.pc.switchSide).toBe(true);
  });

  it("sails the player's boat on the autopilot Helm when it is on", () => {
    const { session, controls, pc, p } = setup(HELM);
    controls.autopilotOn = true;
    controls.apply(1 / 60, session);
    expect(controls.autopilot!.racer).toBe(p);
    expect(controls.autopilot!.profile).toBe(AUTOPILOT_HELM);
    expect(pc.rudder).not.toBe(0.4);
  });

  it("leaves the helm to the Partner and trims perfectly as Crew on the autopilot", () => {
    const { session, controls, pc, p } = setup(CREW);
    const before = [pc.rudder, pc.sheet];
    controls.autopilotOn = true;
    controls.apply(1 / 60, session);
    expect([pc.rudder, pc.sheet]).toEqual(before);
    expect([pc.jibSheet, pc.crewOut]).toEqual([p.sim.telemetry.jib!.optimal, p.sim.telemetry.crew!.ideal]);
  });
});

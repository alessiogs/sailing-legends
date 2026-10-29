/**
 * The fleet factory: who races (player, Partner, opponents and their Crews) and where every boat starts, built
 * from the class, the player's choices and the Rivals, then handed to the race session as it is.
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { makeFleet, type Fleet, type FleetOptions } from "../src/race/Fleet";
import { CREW, FULL_BOAT, HELM } from "../src/race/PlayerChoice";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";
import { RIVALS } from "../src/sailors/Sailors";

/** Each boat as `id helm/crew`, with sailors by id. */
const crews = (f: Fleet) => [f.player, ...f.opponents].filter(b => b !== null).map(b => {
  const seat = (a: typeof b.helm | null) => a === null ? "-" : a === "player" ? "player" : a.id;
  return `${b.id} ${seat(b.helm)}/${seat(b.crew)}`;
});
const fleet = (opts: FleetOptions) => crews(makeFleet(opts));

describe("fleet factory", () => {
  it("races the player against the three Rivals in a single-handed class", () => {
    expect(fleet({})).toEqual(["player player/-", "ai0 luca/-", "ai1 giulia/-", "ai2 marco/-"]);
    expect(fleet({ boatClass: OPTIMIST, withPlayer: false })).toEqual(["ai0 luca/-", "ai1 giulia/-", "ai2 marco/-"]);
    expect(makeFleet({ boatClass: OPTIMIST, choice: CREW })).toMatchObject({ choice: HELM, partner: null });
  });

  it("puts the Partner on the player's boat and the extra Helm among the opponents", () => {
    const rivals = ["ai0 luca/sara", "ai1 marco/tommaso", "ai2 elena/pietro"];
    expect(fleet({ boatClass: I420, choice: HELM })).toEqual(["player player/giulia", ...rivals]);
    expect(fleet({ boatClass: I420, choice: FULL_BOAT })).toEqual(["player player/giulia", ...rivals]);
    expect(fleet({ boatClass: I420, choice: CREW })).toEqual(["player giulia/player", ...rivals]);
    expect(fleet({ boatClass: I420, choice: CREW, partner: RIVALS[2] }))
      .toEqual(["player marco/player", "ai0 luca/sara", "ai1 giulia/tommaso", "ai2 elena/pietro"]);
    expect(fleet({ boatClass: I420, withPlayer: false })).toEqual(["ai0 luca/sara", "ai1 giulia/tommaso", "ai2 marco/pietro"]);
  });

  it("keeps the player's choices with the fleet", () => {
    const full = makeFleet({ boatClass: I420, choice: FULL_BOAT });
    expect([full.choice, full.partner?.id]).toEqual([FULL_BOAT, "giulia"]);
    expect(makeFleet({ boatClass: I420, withPlayer: false })).toMatchObject({ choice: HELM, partner: null, player: null });
  });

  it("races any Rivals it is given", () => {
    expect(fleet({ rivals: [RIVALS[2], RIVALS[0]] })).toEqual(["player player/-", "ai0 marco/-", "ai1 luca/-"]);
  });

  it("spreads the boats below the start line as before, wider for two-person boats", () => {
    const spots = (f: Fleet) => [f.player, ...f.opponents].map(b => b && [b.start.downwind, b.start.across, b.start.heading / DEG]);
    expect(spots(makeFleet({}))).toEqual([[30, 6, -70], [24, -16, -80], [26, -2, -80], [28, 12, -80]]);
    const two = spots(makeFleet({ boatClass: I420 })).map(s => s!.map(v => Math.round(v * 1e9) / 1e9));
    expect(two).toEqual([[42, 8.4, -70], [33.6, -22.4, -80], [36.4, -2.8, -80], [39.2, 16.8, -80]]);
  });
});

describe("race session from a fleet", () => {
  it("races the boats of the fleet it is given, with the fleet's choices", () => {
    const f = makeFleet({ boatClass: I420, choice: CREW, partner: RIVALS[0] });
    const s = new RaceSession({ fleet: f });
    expect(s.race.racers.map(r => r.id)).toEqual(["player", "ai0", "ai1", "ai2"]);
    expect([s.choice, s.partner?.id, s.partnerHelm !== null, s.partnerCrew, s.ais.length, s.crews.length])
      .toEqual([CREW, "luca", true, null, 3, 3]);
  });

  it("places the player's boat on its starting spot (wind from north: downwind is south)", () => {
    const st = new RaceSession({ fleet: makeFleet({ boatClass: I420 }) }).player!.sim.state;
    expect([st.x, st.z, st.heading].map(v => Math.round(v * 1e9) / 1e9)).toEqual([8.4, -42, Math.round(-70 * DEG * 1e9) / 1e9]);
    const opt = new RaceSession().player!.sim.state;
    expect([opt.x, opt.z, opt.heading]).toEqual([6, -30, -70 * DEG]);
  });
});

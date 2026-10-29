/**
 * The fleet factory: who races (player, Partner, opponents and their Crews) and where every boat starts, built
 * from the class, the player's choices and the Rivals, then handed to the race session as it is.
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { courseObstacles, closestSegSeg, hullRadius, hullSegment, overlapObstacle } from "../src/race/Collisions";
import { makeFleet, startSlot, type Fleet, type FleetOptions } from "../src/race/Fleet";
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

describe("big fleets (Career)", () => {
  /** `n` opponent boats of Helms (and Crews in two-person classes) named h0.., c0.. */
  const seats = (n: number, crews: boolean) => Array.from({ length: n }, (_, i) => ({
    helm: { ...RIVALS[0], id: `h${i}`, name: `H${i}` },
    crew: crews ? { ...RIVALS[1], id: `c${i}`, name: `C${i}` } : null,
  }));
  const big = (n: number, boatClass = OPTIMIST) => makeFleet({ boatClass, opponents: seats(n, boatClass === I420) });

  it("races exactly the opponent boats it is given, with ids ai0.. in order", () => {
    const f = big(11);
    expect(f.opponents.map(b => b.id)).toEqual(Array.from({ length: 11 }, (_, i) => `ai${i}`));
    expect(f.opponents.map(b => b.helm.id)).toEqual(Array.from({ length: 11 }, (_, i) => `h${i}`));
    expect(f.player?.id).toBe("player");
    expect(big(5, I420).opponents.map(b => b.crew?.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("keeps the quick race's line and spots when the fleet is small", () => {
    expect(makeFleet({}).lineHalf).toBeUndefined();
    expect(makeFleet({ boatClass: I420 }).lineHalf).toBeUndefined();
    const spots = (f: Fleet) => [f.player, ...f.opponents].map(b => b && [b.start.downwind, b.start.across, b.start.heading / DEG]);
    expect(spots(big(3))).toEqual(spots(makeFleet({})));
  });

  it("lengthens the start line with the fleet", () => {
    expect(big(4).lineHalf).toBe(24);
    expect(Math.abs(big(11).lineHalf! - 57.6) < 1e-9).toBe(true);
    expect(Math.abs(big(11, I420).lineHalf! - 81.6) < 1e-9).toBe(true);
    const c = new RaceSession({ fleet: big(11) }).race.course;
    expect(Math.abs(Math.hypot(c.pin.x - c.committee.x, c.pin.z - c.committee.z) - 117.2) < 1e-9).toBe(true);
  });

  for (const [name, cls, n] of [["Optimist", OPTIMIST, 11], ["420", I420, 11], ["Optimist club", OPTIMIST, 5]] as const) {
    it(`starts ${n + 1} ${name} boats clear of each other (3/4 of a boat length), off the marks`, () => {
      const s = new RaceSession({ fleet: big(n, cls) });
      const rs = s.race.racers;
      expect(rs.length).toBe(n + 1);
      const gap = (a: typeof rs[number], b: typeof rs[number]) =>
        closestSegSeg(hullSegment(a.sim.state, cls), hullSegment(b.sim.state, cls)).d;
      for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
          expect(gap(rs[i], rs[j]), `${rs[i].id} ${rs[j].id}`).toBeGreaterThan(0.75 * cls.length);
        }
        const h = hullSegment(rs[i].sim.state, cls);
        for (const o of courseObstacles(s.race.course)) expect(overlapObstacle(h, hullRadius(cls), o.shape), rs[i].id).toBe(null);
      }
    });
  }

  it("leaves the AI start slots of a small fleet as they were", () => {
    expect([0, 1, 2, 3].map(i => startSlot(i, 4))).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2].map(i => startSlot(i, 3))).toEqual([0, 1, 2]);
    const slots = Array.from({ length: 12 }, (_, i) => startSlot(i, 12));
    expect(slots[0]).toBe(0);
    expect(slots[11]).toBe(3);
    expect(slots.every((v, i) => i === 0 || v > slots[i - 1])).toBe(true);
  });
});

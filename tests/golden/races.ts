/**
 * The golden races: nine fixed-seed races sailed headless, recorded as plain data that can be compared with
 * the committed snapshot (`races.json`). Shared by the golden test (compares) and `npm run golden:update`
 * (writes), so both produce the record the same way.
 *
 * What is recorded: every boat's position, heading and speed every 10 s; finish times, DSQs and the final
 * standings; and every race event as kind, boat, other boat and time, plus the turns owed for a penalty.
 * Event wording is never recorded, so moving text into translation catalogs cannot change the record.
 *
 * Event kinds come from `RaceEvent.kind`, which is already data. When events become structured (ADR 0001),
 * keep these kind strings, the racer/other ids and the turns as they are so the snapshot stays comparable.
 */
import { DEG } from "../../src/core/math";
import { RacingAI } from "../../src/ai/RacingAI";
import { distanceTo, legTarget } from "../../src/race/Course";
import type { Race, Racer } from "../../src/race/Race";
import { FIXED_DT, RaceSession, type PlayerRole } from "../../src/race/RaceSession";
import { I420, OPTIMIST, type BoatClass } from "../../src/sailing/BoatClass";

/** How the player boat is sailed: its Role and Control mode, as the session option spells them today. */
type PlayerSetup = PlayerRole;

export type GoldenRace = { name: string; cls: BoatClass; seed: number; windKn: number; player: PlayerSetup | null };

export const GOLDEN_RACES: GoldenRace[] = [
  ...[OPTIMIST, I420].flatMap(cls =>
    ([[11, 11], [3, 7], [5, 16]] as const).map(([seed, windKn]) => ({
      name: `${cls.name} seed ${seed} ${windKn} kn, AI only`, cls, seed, windKn, player: null,
    })),
  ),
  { name: "420 seed 11 11 kn, player Helm", cls: I420, seed: 11, windKn: 11, player: "skipper" },
  { name: "420 seed 3 7 kn, player Crew", cls: I420, seed: 3, windKn: 7, player: "crew" },
  { name: "420 seed 5 16 kn, player Full Boat Control", cls: I420, seed: 5, windKn: 16, player: "full" },
];

/** A race still running after this many simulated seconds is cut off (the record shows it unfinished). */
const MAX_RACE_S = 900;
/** Sample every boat every this many fixed steps (10 s at 60 Hz). */
const SAMPLE_STEPS = 600;

export type GoldenRecord = {
  /** Seconds since the session was created, then per boat id: [x, z, heading, speed]. */
  samples: { t: number; boats: Record<string, number[]> }[];
  /** Race clock when each event was drained (right after the step that emitted it). */
  events: { t: number; kind: string; racer: string; other?: string; turns?: number }[];
  results: { id: string; finishTime: number | null; dsq: boolean; leg: number }[];
  standings: string[];
  endClock: number;
};

/** Round to 6 decimals, with no negative zero (so the JSON text is stable). */
const r6 = (v: number) => {
  const x = Math.round(v * 1e6) / 1e6;
  return x === 0 ? 0 : x;
};

/**
 * The test-only player: a Racing AI Helm (same profile, seed and slot as the browser autopilot) and a fixed,
 * perfect Crew routine. It is written here, not shared with the browser code, so the guard never depends on
 * the code it guards. What it drives depends on the Role:
 *  - Helm ("skipper"): rudder and mainsheet; the session's Partner Crew does the rest.
 *  - Crew: jib, spinnaker, weight and side switches; the session's Partner Helm steers.
 *  - Full Boat Control ("full"): rudder and mainsheet, plus the spinnaker calls to the Partner Crew.
 */
class TestPlayer {
  private helm: RacingAI | null;

  constructor(private session: RaceSession, private role: PlayerSetup) {
    const p = session.player!;
    this.helm = role === "crew" ? null
      : new RacingAI(p, { name: "Auto", technique: 0.95, tactics: 0.9, speed: 0.9, discipline: 0.9 }, session.race, 99, 3);
  }

  /** Set the player's controls for the next fixed step. */
  update(dt: number) {
    const s = this.session, p = s.player!, pc = s.playerControls;
    if (this.helm) {
      const c = this.helm.update(dt, s.wind);
      pc.rudder = c.rudder;
      pc.sheet = c.sheet;
    }
    if (this.role === "crew") {
      const t = p.sim.telemetry;
      pc.jibSheet = t.jib?.optimal;
      pc.spiSheet = t.spi?.optimal;
      pc.crewOut = t.crew?.ideal;
      pc.spi = spinnakerWanted(s.race, p);
      if ((t.jib?.backed || !t.crew?.onWindward) && Math.abs(t.awa) > 22 * DEG) pc.switchSide = true;
    }
    if (this.role === "full") s.partnerCrew!.spiCommand = spinnakerWanted(s.race, p);
  }
}

/** The perfect Crew's spinnaker rule: up on a downwind leg, well away from the mark, with no penalty owed. */
function spinnakerWanted(race: Race, r: Racer): boolean {
  const leg = r.leg >= 0 && r.leg < race.course.legs.length ? race.course.legs[r.leg] : null;
  if (!leg || leg.upwind || r.finishTime !== null || r.penalty) return false;
  const s = r.sim.state;
  if (distanceTo(legTarget(leg), s.x, s.z) < 26) return false;
  return Math.abs(r.sim.telemetry.twa) > 105 * DEG;
}

export function sailGoldenRace(g: GoldenRace): GoldenRecord {
  const session = new RaceSession({
    seed: g.seed, windKn: g.windKn, boatClass: g.cls, withPlayer: g.player !== null, ...(g.player ? { role: g.player } : {}),
  });
  const race = session.race;
  const player = g.player ? new TestPlayer(session, g.player) : null;
  const rec: GoldenRecord = { samples: [], events: [], results: [], standings: [], endClock: 0 };
  const sample = (step: number) => {
    const boats: Record<string, number[]> = {};
    for (const r of race.racers) {
      const s = r.sim.state;
      boats[r.id] = [r6(s.x), r6(s.z), r6(s.heading), r6(r.sim.telemetry.speed)];
    }
    rec.samples.push({ t: step / SAMPLE_STEPS * 10, boats });
  };

  const maxSteps = MAX_RACE_S / FIXED_DT;
  let step = 0;
  sample(step);
  while (race.phase !== "done" && step < maxSteps) {
    player?.update(FIXED_DT);
    session.step(FIXED_DT);
    step++;
    for (const e of race.drainEvents()) {
      const ev: GoldenRecord["events"][number] = { t: r6(race.clock), kind: e.kind, racer: e.racer.id };
      if (e.other) ev.other = e.other.id;
      // Penalty turns owed (1 for a mark, 2 for a rule breach), read from the racer since the event carries only text.
      if (e.kind === "penalty") ev.turns = Math.round(e.racer.penalty!.needed / (2 * Math.PI));
      rec.events.push(ev);
    }
    if (step % SAMPLE_STEPS === 0) sample(step);
  }
  if (step % SAMPLE_STEPS !== 0) sample(step);

  rec.results = race.racers.map(r => ({ id: r.id, finishTime: r.finishTime === null ? null : r6(r.finishTime), dsq: r.dsq, leg: r.leg }));
  rec.standings = race.standings().map(r => r.id);
  rec.endClock = r6(race.clock);
  return rec;
}

/** The whole snapshot: every golden race, keyed by name. */
export function sailAllGoldenRaces(): Record<string, GoldenRecord> {
  const out: Record<string, GoldenRecord> = {};
  for (const g of GOLDEN_RACES) out[g.name] = sailGoldenRace(g);
  return out;
}

/** JSON text of a snapshot: two-space indent, but each array of numbers kept on one line for readable diffs. */
export function formatSnapshot(snapshot: Record<string, GoldenRecord>): string {
  return JSON.stringify(snapshot, null, 2).replace(/\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g, (_, nums: string) => `[${nums.split(/,\s+/).join(", ")}]`) + "\n";
}

export const SNAPSHOT_URL = new URL("./races.json", import.meta.url);

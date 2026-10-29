import { dirX, dirZ } from "../core/math";
import { CrewAI } from "../ai/CrewAI";
import { RacingAI } from "../ai/RacingAI";
import { isTwoPerson, type BoatClass } from "../sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../sailing/BoatPhysics";
import { WindField } from "../sailing/Wind";
import { courseObstacles, hullRadius, hullSegment, overlapObstacle, pushOut, separateHulls } from "./Collisions";
import { makeWindwardLeeward, type Course } from "./Course";
import { makeFleet, type Aboard, type Fleet, type StartSpot } from "./Fleet";
import { Race, type Racer, type Sailor } from "./Race";
import type { SailorProfile } from "../sailors/Sailors";
import type { PlayerChoice } from "./PlayerChoice";

/**
 * Everything that makes up one race, with no rendering: wind, course, boats, AI and rules.
 * It runs at a fixed timestep, so the same code drives the browser game and headless tests.
 */
export const FIXED_DT = 1 / 60;

const sailor = (a: Aboard): Sailor => a === "player" ? { kind: "player" } : { kind: "ai", name: a.name };

export type SessionOptions = {
  seed?: number;
  windKn?: number;
  countdown?: number;
  /** Who races and where they start (default: `makeFleet()`, an Optimist race with the player as Helm). */
  fleet?: Fleet;
};

export class RaceSession {
  wind: WindField;
  race: Race;
  player: Racer | null = null;
  ais: RacingAI[] = [];
  crews: CrewAI[] = [];
  /** The player's Partner: the Helm when the player is the Crew, the Crew when the player is the Helm. */
  partnerHelm: RacingAI | null = null;
  partnerCrew: CrewAI | null = null;
  readonly choice: PlayerChoice;
  readonly partner: SailorProfile | null;
  playerControls: Controls = { rudder: 0, sheet: 0.55, jibSheet: 0.5, spiSheet: 0.5, crewOut: 0.3, spi: false };
  private acc = 0;

  constructor(opts: SessionOptions = {}) {
    const seed = opts.seed ?? 11;
    const fleet = opts.fleet ?? makeFleet();
    const cls = fleet.boatClass;
    this.choice = fleet.choice;
    this.partner = fleet.partner;
    this.wind = new WindField({ seed, meanDirDeg: 0, meanSpeedKn: opts.windKn ?? 11 });
    const course = isTwoPerson(cls)
      ? makeWindwardLeeward(this.wind.meanDir, { beat: 125, lineHalf: 34, run: 50 })
      : makeWindwardLeeward(this.wind.meanDir);
    this.race = new Race(course, opts.countdown ?? 45);

    // Every AI is seeded from the session's seed and its place in the fleet, so a seed always sails the same race.
    const p = fleet.player;
    if (p) {
      this.player = this.race.add(p.id, { helm: sailor(p.helm), crew: p.crew && sailor(p.crew) }, boatAt(cls, course, p.start), true);
      if (p.helm !== "player") {
        this.partnerHelm = new RacingAI(this.player, p.helm, this.race, seed * 17, 3);
      } else if (p.crew && p.crew !== "player") {
        this.partnerCrew = new CrewAI(this.player, p.crew, this.race, seed * 19);
        this.partnerCrew.spiMode = this.choice.control === "fullBoat" ? "command" : "auto";
      }
    }
    fleet.opponents.forEach((b, i) => {
      const racer = this.race.add(b.id, { helm: sailor(b.helm), crew: b.crew && sailor(b.crew) }, boatAt(cls, course, b.start));
      const ai = new RacingAI(racer, b.helm, this.race, seed * 31 + i * 7, i);
      ai.placeAtStart();
      this.ais.push(ai);
      if (b.crew) this.crews.push(new CrewAI(racer, b.crew, this.race, seed * 37 + i * 11));
    });
  }

  /** Advance by a variable frame time using fixed sub-steps. Returns the number of steps taken. */
  advance(frameDt: number): number {
    this.acc += Math.min(frameDt, 0.25);
    let n = 0;
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
      n++;
    }
    return n;
  }

  /** Fraction of a step left in the accumulator (for render interpolation). */
  get alpha() {
    return this.acc / FIXED_DT;
  }

  step(dt: number) {
    this.wind.update(dt);
    this.ais.forEach((ai, i) => {
      const c = ai.update(dt, this.wind);
      this.crews[i]?.update(dt, c);
      ai.racer.sim.step(dt, c, this.wind);
    });
    if (this.player) {
      const pc = this.playerControls;
      if (this.partnerHelm) {
        const c = this.partnerHelm.update(dt, this.wind);
        pc.rudder = c.rudder;
        pc.sheet = c.sheet;
      }
      this.partnerCrew?.update(dt, pc);
      this.player.sim.step(dt, pc, this.wind);
    }
    this.resolveCollisions();
    this.race.update(dt);
  }

  /**
   * Contacts: overlapping hulls, marks and the committee boat are pushed apart (see Collisions.ts),
   * and the race is told so it can apply the rules.
   */
  private resolveCollisions() {
    const rs = this.race.racers;
    const c = this.race.course;
    const obstacles = courseObstacles(c);
    const finishIdx = c.legs.findIndex(l => l.kind === "finish");
    // Rule 31 only covers the marks of the leg being sailed (and the start marks before starting).
    const counts = (r: Racer, key: string) => {
      if (key === "pin" || key === "committee") return r.leg === -1;
      if (key === "m0") return r.leg === 0;
      if (key === "m1") return r.leg === 1;
      return r.leg === finishIdx;
    };
    for (let i = 0; i < rs.length; i++) {
      const A = rs[i], a = A.sim.state;
      for (let j = i + 1; j < rs.length; j++) {
        const B = rs[j];
        if (separateHulls(a, A.sim.cls, B.sim.state, B.sim.cls)) this.race.contact(A, B);
      }
      // One hull position for every obstacle, taken before any of them pushes the boat.
      const h = hullSegment(a, A.sim.cls);
      const r = hullRadius(A.sim.cls);
      for (const o of obstacles) {
        const overlap = overlapObstacle(h, r, o.shape);
        if (!overlap) continue;
        pushOut(a, overlap);
        if (counts(A, o.key)) this.race.markTouch(A, o.key);
      }
    }
  }
}

/** A boat of the class placed at its starting spot on the course. */
function boatAt(cls: BoatClass, course: Course, start: StartSpot): BoatSim {
  const d = start.downwind;
  const p = { x: -dirX(course.windDir) * d, z: -dirZ(course.windDir) * d };
  return new BoatSim(cls, createBoat(p.x + start.across, p.z, course.windDir + start.heading));
}

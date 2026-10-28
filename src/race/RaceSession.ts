import { DEG, dirX, dirZ } from "../core/math";
import { CrewAI } from "../ai/CrewAI";
import { RacingAI } from "../ai/RacingAI";
import { isTwoPerson, OPTIMIST, type BoatClass } from "../sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../sailing/BoatPhysics";
import { WindField } from "../sailing/Wind";
import { courseObstacles, hullRadius, hullSegment, overlapObstacle, pushOut, separateHulls } from "./Collisions";
import { makeWindwardLeeward } from "./Course";
import { Race, type Racer, type Sailor } from "./Race";
import { opponentCrew, opponentHelms, RIVALS, type SailorProfile } from "../sailors/Sailors";
import { HELM, type PlayerChoice } from "./PlayerChoice";

/**
 * Everything that makes up one race, with no rendering: wind, course, boats, AI and rules.
 * It runs at a fixed timestep, so the same code drives the browser game and headless tests.
 */
export const FIXED_DT = 1 / 60;

const PLAYER: Sailor = { kind: "player" };
const aiSailor = (profile: SailorProfile): Sailor => ({ kind: "ai", name: profile.name });

export type SessionOptions = {
  seed?: number;
  windKn?: number;
  countdown?: number;
  rivals?: readonly SailorProfile[];
  boatClass?: BoatClass;
  /** Include a player-controlled boat (false for AI-only test races). */
  withPlayer?: boolean;
  /** Two-person classes: the player's Role and Control mode (default: Helm, Player Career), and their Partner. */
  choice?: PlayerChoice;
  partner?: SailorProfile;
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
  choice: PlayerChoice = HELM;
  partner: SailorProfile | null = null;
  playerControls: Controls = { rudder: 0, sheet: 0.55, jibSheet: 0.5, spiSheet: 0.5, crewOut: 0.3, spi: false };
  private acc = 0;

  constructor(opts: SessionOptions = {}) {
    const seed = opts.seed ?? 11;
    const cls = opts.boatClass ?? OPTIMIST;
    this.wind = new WindField({ seed, meanDirDeg: 0, meanSpeedKn: opts.windKn ?? 11 });
    const two = isTwoPerson(cls);
    const course = two
      ? makeWindwardLeeward(this.wind.meanDir, { beat: 125, lineHalf: 34, run: 50 })
      : makeWindwardLeeward(this.wind.meanDir);
    this.race = new Race(course, opts.countdown ?? 45);
    const scale = two ? 1.4 : 1;

    const down = (d: number) => ({ x: -dirX(course.windDir) * d, z: -dirZ(course.windDir) * d });
    let rivals: readonly SailorProfile[] = opts.rivals ?? RIVALS;
    if (opts.withPlayer !== false) {
      const p = down(30 * scale);
      const sim = new BoatSim(cls, createBoat(p.x + 6 * scale, p.z, course.windDir - 70 * DEG));
      if (two) {
        this.choice = opts.choice ?? HELM;
        this.partner = opts.partner ?? rivals[1];
        const partner = aiSailor(this.partner);
        this.player = this.race.add("player", this.choice.role === "crew" ? { helm: partner, crew: PLAYER } : { helm: PLAYER, crew: partner }, sim, true);
        if (this.choice.role === "crew") {
          this.partnerHelm = new RacingAI(this.player, this.partner, this.race, seed * 17, 3);
        } else {
          this.partnerCrew = new CrewAI(this.player, this.partner, this.race, seed * 19);
          this.partnerCrew.spiMode = this.choice.control === "fullBoat" ? "command" : "auto";
        }
        // The Partner is on our boat, so race against the other Rivals plus the extra Helm.
        rivals = opponentHelms(rivals, this.partner);
      } else {
        this.player = this.race.add("player", { helm: PLAYER, crew: null }, sim, true);
      }
    }
    rivals.forEach((prof, i) => {
      const p = down((24 + i * 2) * scale);
      const sim = new BoatSim(cls, createBoat(p.x + (-16 + i * 14) * scale, p.z, course.windDir - 80 * DEG));
      const crew = two ? opponentCrew(i) : null;
      const racer = this.race.add(`ai${i}`, { helm: aiSailor(prof), crew: crew && aiSailor(crew) }, sim);
      const ai = new RacingAI(racer, prof, this.race, seed * 31 + i * 7, i);
      ai.placeAtStart();
      this.ais.push(ai);
      if (crew) this.crews.push(new CrewAI(racer, crew, this.race, seed * 37 + i * 11));
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

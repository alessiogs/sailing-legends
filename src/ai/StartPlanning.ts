import { angleDiff, DEG, dirX, dirZ, wrapPi } from "../core/math";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { distanceTo, type Point } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import type { SailorProfile } from "../sailors/Sailors";
import { CLOSE_HAULED } from "./angles";

/**
 * What start planning borrows from the rest of the Helm: steering toward a point (beating when it lies
 * upwind) and the tack timer it shares with the other tack decisions.
 */
export interface CourseSteering {
  /** Heading toward a point, tacking upwind when it lies inside the no-go zone. */
  headingToward(p: Point, fromDir: number, x: number, z: number, heading: number): number;
  /** Seconds since the Helm last decided to tack. */
  sinceTack(): number;
  /** Record a tack decided now. */
  tackNow(): void;
}

/** A start planning decision: the heading to steer, the sheet to set and a debug label. */
export type StartSteer = { desired: number; sheet: number; debug: string };

/**
 * The Racing AI's start: before the gun it picks a point on the line, waits at a holding spot below and to
 * the right of it, then times a starboard-tack run so the boat reaches the line around the gun. After the
 * gun, until the boat has started, it brings an OCS boat back below the line and sails it across.
 */
export class StartPlanning {
  /** Where on the start line this boat aims to cross. */
  readonly linePoint: Point;
  /** Where the boat waits before the run to the line. */
  readonly holdSpot: Point;
  /** Late/early bias in seconds: undisciplined sailors push the line (risking OCS). */
  readonly startBias: number;
  private holding = false;
  private going = false;

  /**
   * Draws two numbers from `rand` (the line point, then the start bias), in that order.
   * `k` is the Helm's size factor: the holding spot and the run speed scale with boat length.
   */
  constructor(private race: Race, private profile: SailorProfile, private k: number, rand: () => number, slot: number) {
    const c = race.course;
    const t = 0.2 + slot * 0.25 + (rand() - 0.5) * 0.1;
    this.linePoint = {
      x: c.start.a.x + (c.start.b.x - c.start.a.x) * t,
      z: c.start.a.z + (c.start.b.z - c.start.a.z) * t,
    };
    const back = 15 * k, right = 13 * k;
    const rx = dirX(c.windDir + Math.PI / 2), rz = dirZ(c.windDir + Math.PI / 2);
    this.holdSpot = {
      x: this.linePoint.x - dirX(c.windDir) * back + rx * right,
      z: this.linePoint.z - dirZ(c.windDir) * back + rz * right,
    };
    this.startBias = (1 - profile.discipline) * 5 + (rand() - 0.5) * 2.5;
  }

  /** Start the race already waiting at the holding spot, ready for the run to the line. */
  placeAtStart(racer: Racer) {
    const s = racer.sim.state;
    s.x = this.holdSpot.x;
    s.z = this.holdSpot.z;
    s.heading = wrapPi(this.race.course.windDir - 75 * DEG);
    s.vx = s.vz = 0;
    racer.prevX = s.x;
    racer.prevZ = s.z;
    this.holding = true;
  }

  /** Before the gun: hold below the line, then run to it so as to cross around the gun. */
  prestart(steering: CourseSteering, s: BoatState, tel: Telemetry, windSpeed: number, fromDir: number): StartSteer {
    const race = this.race;
    let desired: number;
    let sheet = tel.optimalSheet;
    let debug: string;
    const above = race.aboveStart(s.x, s.z);
    // Time needed to reach the line close-hauled from here, including accelerating.
    const runDist = Math.max(0, -above) / Math.cos(CLOSE_HAULED);
    const need = runDist / ((0.55 + 0.11 * windSpeed) * this.k) + 3.5;
    if (!this.going && race.clock >= -need + this.startBias) this.going = true;
    if (!this.going) {
      const d = distanceTo(this.holdSpot, s.x, s.z);
      if (this.holding && d > 16) this.holding = false;
      if (!this.holding && d < 7) this.holding = true;
      if (above > -3) {
        // Too close to / over the line: bear away and go back down.
        desired = wrapPi(fromDir + Math.PI * 0.75 * (tel.twa >= 0 ? -1 : 1));
        debug = "back off";
      } else if (!this.holding) {
        desired = steering.headingToward(this.holdSpot, fromDir, s.x, s.z, s.heading);
        debug = "to hold";
      } else {
        // Hold position: close reach with the sail luffing.
        desired = wrapPi(fromDir - 75 * DEG); // starboard close reach, ready to go
        // Crawl: just enough sail to hold steerage way without gaining speed.
        sheet = tel.speed > 0.35 ? 1 : Math.min(1, tel.optimalSheet + 0.18);
        debug = "hold";
      }
    } else {
      desired = this.toStartLine(steering, fromDir, s.x, s.z, s.heading);
      // Early? Spill wind to kill time (disciplined sailors are more careful).
      const eta = runDist / Math.max(tel.speed, 0.5);
      const margin = 1.5 * this.profile.discipline - (1 - this.profile.discipline) * 2;
      if (race.clock + eta < -margin - 1.5 && above < -1.5 && tel.speed > 0.6) sheet = Math.min(1, tel.optimalSheet + 0.3);
      debug = "go";
    }
    return { desired, sheet, debug };
  }

  /** After the gun, until the boat has started: an OCS boat ducks back below the line, then sails across. */
  afterGun(steering: CourseSteering, racer: Racer, tel: Telemetry, fromDir: number): StartSteer {
    const s = racer.sim.state;
    if (racer.ocs && !racer.clearedBack) {
      // Bear away on the current side (never tack) to get back below the line.
      return { desired: wrapPi(fromDir + Math.PI - (Math.sign(tel.twa) || 1) * 0.35), sheet: 1, debug: "ocs return" };
    }
    return { desired: this.toStartLine(steering, fromDir, s.x, s.z, s.heading), sheet: tel.optimalSheet, debug: "restart" };
  }

  /**
   * Heading for crossing the start line: stay close-hauled on starboard if that course hits the line
   * between the committee boat and the pin, otherwise head for the middle of the line.
   */
  private toStartLine(steering: CourseSteering, fromDir: number, x: number, z: number, heading: number): number {
    const c = this.race.course;
    const a = c.start.a, b = c.start.b;
    const ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez);
    const fetches = (h: number) => {
      const dx = Math.sin(h), dz = Math.cos(h);
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-6) return false;
      const t = ((a.x - x) * ez - (a.z - z) * ex) / den;
      const u = ((a.x - x) * dz - (a.z - z) * dx) / den;
      return t > 0 && u > 4 / len && u < 1 - 6 / len;
    };
    const stbd = wrapPi(fromDir - CLOSE_HAULED), port = wrapPi(fromDir + CLOSE_HAULED);
    const onStbd = angleDiff(heading, fromDir) > 0;
    const cur = onStbd ? stbd : port, other = onStbd ? port : stbd;
    // Keep the current tack if it reaches the line; tack only when necessary (and not too often).
    if (fetches(cur)) return cur;
    if (fetches(other) && steering.sinceTack() > 6) { steering.tackNow(); return other; }
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return steering.headingToward(mid, fromDir, x, z, heading);
  }
}

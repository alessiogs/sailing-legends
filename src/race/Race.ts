import { angleDiff, bearingTo, dirX, dirZ, segmentsCross } from "../core/math";
import type { BoatSim } from "../sailing/BoatPhysics";
import { distanceTo, legTarget, type Course, type Leg, type Line } from "./Course";
import { judge, newPenalty, trackPenalty, type Penalty, type RightOfWayRule, type Rule, type VerdictReason } from "./Rules";

/** A sailor on board: the player, or an AI sailor by their own name. The UI words them (`racerName`). */
export type Sailor = { kind: "player" } | { kind: "ai"; name: string };

/** Who sails a boat: its Helm, and its Crew on two-person classes. */
export type Sailors = { helm: Sailor; crew: Sailor | null };

export type Racer = {
  id: string;
  sailors: Sailors;
  isPlayer: boolean;
  sim: BoatSim;
  /** -1 before starting, then index into course.legs; equals legs.length once finished. */
  leg: number;
  ocs: boolean;
  /** OCS boats must get fully back behind the line before restarting. */
  clearedBack: boolean;
  finishTime: number | null;
  /** Accumulated bearing sweep around the current mark (rad), for rounding detection. */
  sweep: number;
  lastBearing: number | null;
  prevX: number;
  prevZ: number;
  /** Penalty turns still owed, if any. */
  penalty: Penalty | null;
  /** Finished without serving a penalty: disqualified. */
  dsq: boolean;
};

/**
 * Something that happened in the race, as data (ADR 0001): the UI words it. `racer` is the boat it concerns;
 * signals meant for the player (`warning`, `gun`) concern the player's boat.
 */
export type RaceEvent =
  | { kind: "warning"; racer: Racer; /** Seconds left to the gun. */ seconds: number }
  | { kind: "gun"; racer: Racer }
  | { kind: "ocs"; racer: Racer }
  | { kind: "ocs-cleared"; racer: Racer }
  | { kind: "start"; racer: Racer; /** The leg now being sailed. */ next: Leg }
  | { kind: "rounded"; racer: Racer; /** The leg just completed. */ rounded: Leg; next: Leg }
  | { kind: "finish"; racer: Racer; /** Finishing place, or null if disqualified (penalty not served). */ place: number | null }
  | { kind: "penalty"; racer: Racer; turns: number; rule: Rule }
  | { kind: "penalty-done"; racer: Racer }
  /**
   * Two boats touched and one was at fault. Each boat gets its own event: `other` is the boat it touched,
   * `atFault` the boat that had to keep clear (`racer` or `other`), under `rule` because of `reason`.
   */
  | { kind: "contact"; racer: Racer; other: Racer; atFault: Racer; rule: RightOfWayRule; reason: VerdictReason };

export type Phase = "prestart" | "racing" | "done";

const ROUND_RADIUS = 30;
const ROUND_SWEEP = (150 * Math.PI) / 180;

export class Race {
  phase: Phase = "prestart";
  /** Race clock: negative during the countdown, 0 at the gun. */
  clock: number;
  racers: Racer[] = [];
  events: RaceEvent[] = [];
  private warned = new Set<number>();
  /** Last time a given pair (or boat+mark) was judged, so one collision gives one penalty. */
  private contactCooldown = new Map<string, number>();

  constructor(public course: Course, countdown = 60) {
    this.clock = -countdown;
  }

  add(id: string, sailors: Sailors, sim: BoatSim, isPlayer = false): Racer {
    const r: Racer = {
      id, sailors, isPlayer, sim, leg: -1, ocs: false, clearedBack: true, finishTime: null,
      sweep: 0, lastBearing: null, prevX: sim.state.x, prevZ: sim.state.z, penalty: null, dsq: false,
    };
    this.racers.push(r);
    return r;
  }

  /** Signed distance "upwind" of the start line (positive = course side). */
  aboveStart(x: number, z: number) {
    const a = this.course.start.a;
    return (x - a.x) * dirX(this.course.windDir) + (z - a.z) * dirZ(this.course.windDir);
  }

  private crossedUp(r: Racer, line: Line) {
    const s = r.sim.state;
    if (!segmentsCross(r.prevX, r.prevZ, s.x, s.z, line.a.x, line.a.z, line.b.x, line.b.z)) return false;
    const mx = s.x - r.prevX, mz = s.z - r.prevZ;
    return mx * dirX(this.course.windDir) + mz * dirZ(this.course.windDir) > 0;
  }

  private emit(event: RaceEvent) {
    this.events.push(event);
  }

  private cooled(key: string) {
    const last = this.contactCooldown.get(key);
    if (last !== undefined && this.clock - last < 15) return false;
    this.contactCooldown.set(key, this.clock);
    return true;
  }

  private givePenalty(r: Racer, turns: number, rule: Rule) {
    // One incident, one penalty: while turns are still owed, further bumps don't stack up.
    if (r.finishTime !== null || r.penalty) return;
    r.penalty = newPenalty(turns, r.sim.state.heading);
    this.emit({ kind: "penalty", racer: r, turns, rule });
  }

  /** Two boats touched: apply the right-of-way rules. */
  contact(a: Racer, b: Racer) {
    if (a.finishTime !== null || b.finishTime !== null) return;
    // A boat taking a penalty must keep clear of one that is not (rule 22.2); it already owes turns, so a contact
    // with it gives nobody a new penalty, and boats doing their turns don't hand out penalties to the fleet.
    if ((a.penalty !== null) !== (b.penalty !== null)) return;
    if (!this.cooled([a.id, b.id].sort().join("|"))) return;
    const v = judge(a.sim, b.sim, this.course.windDir);
    if (!v) return;
    const fault = v.atFault === 0 ? a : b, right = v.atFault === 0 ? b : a;
    const { rule, reason } = v;
    this.emit({ kind: "contact", racer: fault, other: right, atFault: fault, rule, reason });
    this.emit({ kind: "contact", racer: right, other: fault, atFault: fault, rule, reason });
    this.givePenalty(fault, 2, rule);
  }

  /** A boat touched a mark or the committee boat (rule 31). */
  markTouch(r: Racer, markKey: string) {
    if (r.finishTime !== null) return;
    if (!this.cooled(`${r.id}|${markKey}`)) return;
    this.givePenalty(r, 1, "31");
  }

  update(dt: number) {
    const before = this.clock;
    if (this.phase !== "done") this.clock += dt;

    // Countdown signals.
    for (const t of [-30, -10, -5]) {
      if (before < t && this.clock >= t && !this.warned.has(t)) {
        this.warned.add(t);
        const p = this.racers.find(r => r.isPlayer);
        if (p) this.emit({ kind: "warning", racer: p, seconds: -t });
      }
    }

    if (this.phase === "prestart" && this.clock >= 0) {
      this.phase = "racing";
      for (const r of this.racers) {
        if (this.aboveStart(r.sim.state.x, r.sim.state.z) > 0) {
          r.ocs = true;
          r.clearedBack = false;
          this.emit({ kind: "ocs", racer: r });
        }
      }
      const p = this.racers.find(r => r.isPlayer);
      if (p) this.emit({ kind: "gun", racer: p });
    }

    for (const r of this.racers) {
      const s = r.sim.state;
      if (r.penalty && trackPenalty(r.penalty, s.heading)) {
        r.penalty = null;
        this.emit({ kind: "penalty-done", racer: r });
      }
      if (this.phase === "racing" && r.finishTime === null) this.updateRacer(r);
      r.prevX = s.x;
      r.prevZ = s.z;
    }

    if (this.phase === "racing" && this.racers.every(r => r.finishTime !== null)) this.phase = "done";
  }

  private updateRacer(r: Racer) {
    const s = r.sim.state;
    const legs = this.course.legs;

    if (r.leg === -1) {
      if (r.ocs && !r.clearedBack) {
        if (this.aboveStart(s.x, s.z) < -2) {
          r.clearedBack = true;
          this.emit({ kind: "ocs-cleared", racer: r });
        }
        return;
      }
      if (this.crossedUp(r, this.course.start)) {
        r.leg = 0;
        r.ocs = false;
        this.emit({ kind: "start", racer: r, next: legs[0] });
      }
      return;
    }

    const leg = legs[r.leg];
    if (leg.kind === "finish") {
      if (this.crossedUp(r, leg.line)) {
        r.finishTime = this.clock;
        r.leg = legs.length;
        if (r.penalty) {
          r.dsq = true;
          r.penalty = null;
          this.emit({ kind: "finish", racer: r, place: null });
        } else {
          const pos = this.racers.filter(o => o.finishTime !== null && !o.dsq).length;
          this.emit({ kind: "finish", racer: r, place: pos });
        }
      }
      return;
    }

    // Mark rounding: accumulate how far the boat travels around the mark while close to it.
    const d = distanceTo(leg.mark, s.x, s.z);
    if (d < ROUND_RADIUS) {
      const b = bearingTo(leg.mark.x, leg.mark.z, s.x, s.z);
      if (r.lastBearing !== null) r.sweep += angleDiff(r.lastBearing, b);
      r.lastBearing = b;
      const done = leg.rounding === "port" ? r.sweep <= -ROUND_SWEEP : r.sweep >= ROUND_SWEEP;
      if (done) {
        r.leg++;
        r.sweep = 0;
        r.lastBearing = null;
        this.emit({ kind: "rounded", racer: r, rounded: leg, next: legs[r.leg] });
      }
    } else if (d > ROUND_RADIUS * 2) {
      r.sweep = 0;
      r.lastBearing = null;
    }
  }

  /** Higher = further ahead. */
  progress(r: Racer): number {
    if (r.dsq) return -1e7 - (r.finishTime ?? 0);
    if (r.finishTime !== null) return 1e6 - r.finishTime;
    if (r.leg < 0) return -1e4 + this.aboveStart(r.sim.state.x, r.sim.state.z) - (r.ocs ? 1e3 : 0);
    const leg = this.course.legs[r.leg];
    return r.leg * 1e4 - distanceTo(legTarget(leg), r.sim.state.x, r.sim.state.z);
  }

  standings(): Racer[] {
    return [...this.racers].sort((a, b) => this.progress(b) - this.progress(a));
  }

  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

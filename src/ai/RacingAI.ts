import { angleDiff, bearingTo, clamp, DEG, rng, wrapPi } from "../core/math";
import type { Controls } from "../sailing/BoatPhysics";
import type { WindField } from "../sailing/Wind";
import { distanceTo, legTarget, type Point } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import { judge } from "../race/Rules";
import type { SailorProfile } from "../sailors/Sailors";
import { CLOSE_HAULED } from "./angles";
import { StartPlanning, type CourseSteering } from "./StartPlanning";

const ORBIT_R = 9; // for an Optimist; scaled by boat length

export class RacingAI {
  private rand: () => number;
  private lastTack = -999;
  private lastBeat = -999;
  private onStbd: boolean | null = null;
  private time = 0;
  private exitMark: { mark: Point; dir: number } | null = null;
  private lastLeg = -1;
  private startPlan: StartPlanning;
  /** What start planning borrows from this Helm: steering toward a point and the tack timer. */
  private readonly steering: CourseSteering = {
    headingToward: (p, fromDir, x, z, heading) => this.headingToward(p, fromDir, x, z, heading),
    sinceTack: () => this.time - this.lastTack,
    tackNow: () => { this.lastTack = this.time; },
  };
  private mode: "sail" | "tack" | "recover" = "sail";
  private tackHeading = 0;
  private tackUntil = 0;
  private trimBias = 0;
  private trimTimer = 0;
  private penaltyDir = 0;
  private tackWait = 0;
  controls: Controls = { rudder: 0, sheet: 0.5 };
  debug = "";

  /** Size factor: distances (holding spot, rounding radius, look-ahead) scale with boat length. */
  private k: number;

  constructor(public racer: Racer, public profile: SailorProfile, private race: Race, seed: number, slot: number) {
    this.rand = rng(seed);
    this.k = Math.min(1.6, Math.max(1, racer.sim.cls.length / 2.31));
    // The start draws its numbers first: keep it constructed before anything else uses `rand`.
    this.startPlan = new StartPlanning(race, profile, this.k, this.rand, slot);
  }

  /** Start the race already waiting at the holding spot, ready for the run to the line. */
  placeAtStart() {
    this.startPlan.placeAtStart(this.racer);
  }

  /** True while the Helm is committed to a tack (used for the "Vira!" call). */
  get tacking() { return this.mode === "tack"; }

  update(dt: number, wind: WindField): Controls {
    this.time += dt;
    const r = this.racer;
    const s = r.sim.state;
    const tel = r.sim.telemetry;
    const w = wind.sample(s.x, s.z);
    // Imperfect wind reading: lower tactics = noisier perception of the direction.
    const fromDir = w.fromDir + Math.sin(this.time * 0.37 + this.profile.name.length) * (1 - this.profile.tactics) * 6 * DEG;

    let desired = s.heading;
    let sheet = tel.optimalSheet;
    const race = this.race;
    const c = race.course;

    if (r.leg !== this.lastLeg) {
      // Just rounded a mark: keep orbiting until the path to the next target clears it.
      const prev = this.lastLeg >= 0 ? c.legs[this.lastLeg] : null;
      if (prev && prev.kind === "mark" && r.leg > this.lastLeg) this.exitMark = { mark: prev.mark, dir: prev.rounding === "port" ? -1 : 1 };
      this.lastLeg = r.leg;
    }

    if (r.finishTime !== null) {
      // Finished: reach off gently and slow down.
      desired = wrapPi(fromDir + 100 * DEG);
      sheet = 1;
      this.debug = "finished";
    } else if (race.phase === "prestart" || r.leg === -1) {
      // Not started yet: the start plan steers (before the gun, or OCS / late after it).
      const steer = race.phase === "prestart"
        ? this.startPlan.prestart(this.steering, s, tel, w.speed, fromDir)
        : this.startPlan.afterGun(this.steering, r, tel, fromDir);
      ({ desired, sheet } = steer);
      this.debug = steer.debug;
    } else {
      const leg = c.legs[r.leg];
      let target = legTarget(leg);
      if (leg.kind === "mark") target = this.orbitPoint(leg.mark, leg.rounding === "port" ? -1 : 1, s.x, s.z);
      if (this.exitMark) {
        const m = this.exitMark.mark;
        if (this.pathBlocked(s.x, s.z, target, m)) target = this.orbitPoint(m, this.exitMark.dir, s.x, s.z);
        else this.exitMark = null;
      }
      desired = this.headingToward(target, fromDir, s.x, s.z, s.heading);
    }

    // Keep clear of boats that have right of way.
    if (r.finishTime === null) ({ desired, sheet } = this.avoid(desired, sheet, fromDir));

    // Penalty turns: keep turning the same way (bear away first) until the turns are done.
    if (r.penalty && r.finishTime === null) {
      if (this.penaltyDir === 0) this.penaltyDir = tel.twa >= 0 ? -1 : 1;
      this.mode = "sail";
      this.onStbd = null;
      this.controls.sheet = tel.optimalSheet;
      this.controls.rudder = tel.speed < -0.05 ? -this.penaltyDir : this.penaltyDir;
      this.debug = "penalty";
      return this.controls;
    }
    this.penaltyDir = 0;

    // Trim: optimal plus a slowly wandering error that shrinks with technique.
    this.trimTimer -= dt;
    if (this.trimTimer <= 0) {
      this.trimTimer = 1.5 + this.rand() * 2;
      this.trimBias = (this.rand() - 0.5) * 0.28 * (1 - this.profile.technique);
    }
    this.controls.sheet = clamp(sheet + this.trimBias, 0, 1);

    // Helm state machine. "tack": committed turn through the wind; "recover": stuck in irons.
    const twaNow = angleDiff(s.heading, fromDir);
    const twaGoal = angleDiff(desired, fromDir);
    const throughWind = (Math.sign(twaNow) || 1) !== (Math.sign(twaGoal) || 1) && Math.abs(twaNow) + Math.abs(twaGoal) < Math.PI;
    if (this.mode === "tack") {
      if (Math.abs(angleDiff(s.heading, this.tackHeading)) < 15 * DEG) this.mode = "sail";
      else if (this.time > this.tackUntil) this.mode = "recover";
      else desired = this.tackHeading;
    }
    if (this.mode === "sail" && throughWind) {
      const busy = this.crowded(7 * this.k);
      if (busy) this.tackWait += dt; else this.tackWait = 0;
      if (tel.speed > 0.45 && (!busy || this.tackWait > 6)) {
        this.tackWait = 0;
        this.mode = "tack";
        this.tackHeading = Math.abs(twaGoal) < CLOSE_HAULED ? wrapPi(fromDir - Math.sign(twaGoal) * CLOSE_HAULED) : desired;
        this.tackUntil = this.time + 7;
        this.onStbd = twaGoal > 0;
        this.lastTack = this.time;
        desired = this.tackHeading;
      } else {
        // Too slow to tack: go round the other way, bearing away through downwind (a gybe).
        desired = wrapPi(fromDir + Math.PI - (Math.sign(twaNow) || 1) * 0.2);
        this.debug += " (gybe round)";
      }
    }
    if (this.mode === "sail" && Math.abs(twaNow) < 35 * DEG && tel.speed < 0.3) this.mode = "recover";
    if (this.mode === "recover") {
      desired = wrapPi(fromDir - (Math.sign(twaNow) || 1) * 75 * DEG);
      this.controls.sheet = 1;
      this.onStbd = null;
      if (Math.abs(twaNow) > 60 * DEG) this.mode = "sail";
    }
    this.debug += ` [${this.mode}]`;
    const err = angleDiff(s.heading, desired);
    const gain = 2.2 + this.profile.speed;
    let rud = clamp(err * gain - s.yawRate * 0.6, -1, 1);
    // Going backward the rudder works the other way round.
    if (tel.speed < -0.05) rud = -rud;
    this.controls.rudder = rud;
    return this.controls;
  }

  /**
   * Look a few seconds ahead for a boat we'd hit; if the rules make us the give-way boat, act:
   * duck behind a starboard-tacker (rule 10), luff away from a leeward boat (rule 11) or slow down
   * when coming up from clear astern (rule 12).
   */
  /** Another racing boat within `dist` metres (don't tack into it: rule 13). */
  private crowded(dist: number) {
    const s = this.racer.sim.state;
    return this.race.racers.some(o => o !== this.racer && o.finishTime === null &&
      Math.hypot(o.sim.state.x - s.x, o.sim.state.z - s.z) < dist);
  }

  private avoid(desired: number, sheet: number, fromDir: number): { desired: number; sheet: number } {
    const me = this.racer, s = me.sim.state;
    let worst: { o: Racer; t: number } | null = null;
    for (const o of this.race.racers) {
      if (o === me || o.finishTime !== null) continue;
      const os = o.sim.state;
      const dx = os.x - s.x, dz = os.z - s.z;
      if (dx * dx + dz * dz > 14 * 14 * this.k * this.k) continue;
      const rvx = os.vx - s.vx, rvz = os.vz - s.vz;
      const rv2 = rvx * rvx + rvz * rvz;
      const t = rv2 > 1e-4 ? clamp(-(dx * rvx + dz * rvz) / rv2, 0, 5) : 0;
      const cx = dx + rvx * t, cz = dz + rvz * t;
      if (Math.hypot(cx, cz) > 4 * this.k) continue;
      if (!worst || t < worst.t) worst = { o, t };
    }
    if (!worst) return { desired, sheet };
    const v = judge(me.sim, worst.o.sim, this.race.course.windDir);
    if (!v || v.atFault !== 0) return { desired, sheet };
    const twa = angleDiff(s.heading, fromDir);
    const side = Math.sign(twa) || 1;
    this.debug += ` avoid r${v.rule}`;
    if (v.rule === "10") {
      // Duck: steer for a point well behind the other boat's stern (at least 30° below our course).
      const os = worst.o.sim.state;
      const sx = os.x - Math.sin(os.heading) * 5, sz = os.z - Math.cos(os.heading) * 5;
      const behind = bearingTo(s.x, s.z, sx, sz);
      const minAway = Math.min(170 * DEG, Math.abs(twa) + 30 * DEG);
      const away = Math.max(minAway, Math.abs(angleDiff(fromDir, behind)));
      return { desired: wrapPi(fromDir - side * Math.min(170 * DEG, away)), sheet };
    }
    if (v.rule === "11") {
      // Windward boat: head up toward the wind, but not into the no-go zone.
      return { desired: wrapPi(fromDir - side * Math.max(42 * DEG, Math.abs(twa) - 18 * DEG)), sheet };
    }
    if (v.rule === "12") return { desired, sheet: Math.min(1, sheet + 0.4) };
    return { desired, sheet };
  }

  /** A point on a small circle around the mark, leading the boat around it in the rounding direction. */
  private orbitPoint(mark: Point, dir: number, x: number, z: number): Point {
    const b = bearingTo(mark.x, mark.z, x, z);
    const d = distanceTo(mark, x, z);
    const lead = d < 20 ? 60 * DEG : 35 * DEG;
    const a = b + dir * lead;
    return { x: mark.x + Math.sin(a) * ORBIT_R * this.k, z: mark.z + Math.cos(a) * ORBIT_R * this.k };
  }

  /** True if the straight path to `target` passes within 6 m of mark `m` (ahead of the boat). */
  private pathBlocked(x: number, z: number, target: Point, m: Point) {
    const dx = target.x - x, dz = target.z - z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return false;
    const t = ((m.x - x) * dx + (m.z - z) * dz) / len2;
    if (t <= 0 || t >= 1) return false;
    const px = x + dx * t - m.x, pz = z + dz * t - m.z;
    return px * px + pz * pz < 36;
  }

  /**
   * Heading toward a point, tacking upwind when it lies inside the no-go zone.
   * Picks the tack that points closer to the target; switches when the other tack is better by
   * a hysteresis margin (smaller for tactical sailors, so they tack on headers sooner).
   */
  private headingToward(p: Point, fromDir: number, x: number, z: number, heading: number): number {
    const brg = bearingTo(x, z, p.x, p.z);
    const offWind = Math.abs(angleDiff(fromDir, brg));
    if (offWind > CLOSE_HAULED + 3 * DEG) {
      this.debug = "direct";
      return brg;
    }
    const stbd = wrapPi(fromDir - CLOSE_HAULED); // wind over starboard side
    const port = wrapPi(fromDir + CLOSE_HAULED);
    if (this.onStbd === null || this.time - this.lastBeat > 2) {
      // (Re)enter beating mode: keep whichever tack the boat is closest to now.
      this.onStbd = Math.abs(angleDiff(heading, stbd)) < Math.abs(angleDiff(heading, port));
    }
    this.lastBeat = this.time;
    const onStbd = this.onStbd;
    const errS = Math.abs(angleDiff(stbd, brg));
    const errP = Math.abs(angleDiff(port, brg));
    const hyst = (20 + (1 - this.profile.tactics) * 12) * DEG;
    const canTack = this.time - this.lastTack > 11;
    let useStbd = onStbd;
    if (onStbd && errP + hyst < errS && canTack) { useStbd = false; this.lastTack = this.time; }
    else if (!onStbd && errS + hyst < errP && canTack) { useStbd = true; this.lastTack = this.time; }
    this.onStbd = useStbd;
    this.debug = useStbd ? "beat stbd" : "beat port";
    return useStbd ? stbd : port;
  }
}

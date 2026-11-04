import {
  angleDiff,
  bearingTo,
  clamp,
  DEG,
  KNOTS,
  rng,
  wrapPi,
} from "../core/math";
import type { Controls } from "../sailing/BoatPhysics";
import type { WindField } from "../sailing/Wind";
import { aimPoint, distanceTo, type Point } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import type { SailorProfile } from "../sailors/Sailors";
import { boatWithin, giveWay } from "./Avoidance";
import { hikeError, hikeLag, hikeScale, rollQuality } from "./hiking";
import { BeatTactics } from "./BeatTactics";
import { RunTactics } from "./RunTactics";
import { StartPlanning } from "./StartPlanning";
import { TackStateMachine } from "./TackStateMachine";

const ORBIT_R = 9; // for an Optimist; scaled by boat length

export class RacingAI {
  private rand: () => number;
  private time = 0;
  private exitMark: { mark: Point; dir: number } | null = null;
  private lastLeg = -1;
  private startPlan: StartPlanning;
  /** Steering toward a point and the tack timer; start planning borrows it as its `CourseSteering`. */
  private readonly beat: BeatTactics;
  private readonly tackMachine: TackStateMachine;
  /** A skiff sails the run at an angle and gybes (the beat's tactics mirrored); other classes run straight at the mark. */
  private readonly run: RunTactics | null;
  private trimBias = 0;
  private trimTimer = 0;
  private penaltyDir = 0;
  private keepClear: { until: number; desired: number; sheet: number } | null =
    null;
  /** Phases of the slow wanders (helming, pointing, wind reading), drawn from their own stream so `rand` keeps its order. */
  private readonly phase: readonly number[];
  /** The Helm's hiking and roll draws: their own stream, so `rand` (the start plan first) keeps its order. */
  private readonly hikeRand: () => number;
  private hikeTimer = 0;
  private hikeBiasTimer = 0;
  private hikeTarget = 0;
  private hikeBias = 0;
  private boomSide = 0;
  controls: Controls = { rudder: 0, sheet: 0.5, roll: 0.5 };
  debug = "";

  /** Size factor: distances (holding spot, rounding radius, look-ahead) scale with boat length. */
  private k: number;

  constructor(
    public racer: Racer,
    public profile: SailorProfile,
    private race: Race,
    seed: number,
    slot: number,
  ) {
    this.rand = rng(seed);
    this.k = Math.min(1.6, Math.max(1, racer.sim.cls.length / 2.31));
    // The start draws its numbers first: keep it constructed before anything else uses `rand`.
    this.startPlan = new StartPlanning(race, profile, this.k, this.rand, slot);
    // The beat's narrowest lane: about 24 m wide in an Optimist, scaled with the boat.
    this.beat = new BeatTactics(profile, () => this.time, 12 * this.k);
    this.tackMachine = new TackStateMachine(this.beat, this.k);
    const p = rng(seed ^ 0x5eed);
    this.phase = [p(), p(), p(), p()].map((v) => v * 2 * Math.PI);
    this.hikeRand = rng(seed ^ 0x41ce);
    // Its draws come from a stream of their own, so no other class's draws (the start plan first) move.
    this.run = racer.sim.cls.spinnaker?.gennaker
      ? new RunTactics(
          profile,
          () => this.time,
          rng(seed ^ 0x6e11),
          12 * this.k,
          14 * this.k,
        )
      : null;
  }

  /** The Helm's weight: the ideal for the wind, seen late (more so the lower the technique) and with a wandering error; and a roll quality per tack or gybe. */
  private hike(dt: number) {
    const { technique } = this.profile;
    const s = this.racer.sim.state,
      tel = this.racer.sim.telemetry;
    this.hikeTimer -= dt;
    if (this.hikeTimer <= 0) {
      this.hikeTimer = hikeLag(technique);
      this.hikeTarget = tel.helm ? tel.helm.ideal : 0;
    } else if (
      this.racer.sim.cls.spinnaker?.gennaker &&
      tel.helm &&
      tel.helm.ideal > this.hikeTarget
    ) {
      // A skiff on the plane is bistable: a Helm still hiking for the weight the boat needed a moment ago, as it speeds up,
      // is overpowered, loses the plane and settles slow. So a skiff's Helm hikes out as soon as more is needed and only eases in late.
      this.hikeTarget = tel.helm.ideal;
    }
    this.hikeBiasTimer -= dt;
    if (this.hikeBiasTimer <= 0) {
      this.hikeBiasTimer = 2 + this.hikeRand() * 3;
      this.hikeBias = hikeError(technique, this.hikeRand());
    }
    this.controls.helmOut = clamp(
      this.hikeTarget + this.hikeBias * hikeScale(tel.puff, tel.tws * KNOTS),
      this.racer.sim.cls.helmRighting.leewardMin,
      1,
    );
    if (s.boomSide !== this.boomSide) {
      this.boomSide = s.boomSide;
      this.controls.roll = rollQuality(technique, this.hikeRand());
    }
  }

  /** A smooth wander in -1..1 with periods of tens of seconds (`i` picks the phase). */
  private wander(i: number, rate: number): number {
    const t = this.time * rate;
    return (
      0.6 * Math.sin(t + this.phase[i]) +
      0.4 * Math.sin(t * 2.3 + this.phase[(i + 1) % 4])
    );
  }

  /** Start the race already waiting at the holding spot, ready for the run to the line. */
  placeAtStart() {
    this.startPlan.placeAtStart(this.racer);
  }

  /** True while the Helm is committed to a tack (used for the "Vira!" call). */
  get tacking() {
    return this.tackMachine.mode === "tack";
  }

  update(dt: number, wind: WindField): Controls {
    this.time += dt;
    const r = this.racer;
    const s = r.sim.state;
    const tel = r.sim.telemetry;
    const w = wind.sample(s.x, s.z);
    const { technique, tactics, speed } = this.profile;
    this.hike(dt);
    // Imperfect wind reading: lower tactics = a wider, slowly wandering error in the wind direction (wrong side,
    // tacking on a lift, overstanding).
    const fromDir = w.fromDir + this.wander(0, 0.11) * (1 - tactics) * 26 * DEG;

    let desired = s.heading;
    let sheet = tel.optimalSheet;
    const race = this.race;
    const c = race.course;

    if (r.leg !== this.lastLeg) {
      // Just rounded a mark: keep orbiting until the path to the next target clears it.
      const prev = this.lastLeg >= 0 ? c.legs[this.lastLeg] : null;
      if (prev && prev.kind === "mark" && r.leg > this.lastLeg)
        this.exitMark = {
          mark: prev.mark,
          dir: prev.rounding === "port" ? -1 : 1,
        };
      this.lastLeg = r.leg;
    }

    if (r.finishTime !== null) {
      // Finished: reach off gently and slow down.
      desired = wrapPi(fromDir + 100 * DEG);
      sheet = 1;
      this.debug = "finished";
    } else if (race.phase === "prestart" || r.leg === -1) {
      // Not started yet: the start plan steers (before the gun, or OCS / late after it).
      const steer =
        race.phase === "prestart"
          ? this.startPlan.prestart(this.beat, s, tel, w.speed, fromDir)
          : this.startPlan.afterGun(this.beat, r, tel, fromDir);
      ({ desired, sheet } = steer);
      this.debug = steer.debug;
    } else {
      const leg = c.legs[r.leg];
      let target = aimPoint(leg, s.x, s.z, 6 * this.k);
      if (leg.kind === "mark")
        target = this.orbitPoint(
          leg.mark,
          leg.rounding === "port" ? -1 : 1,
          s.x,
          s.z,
        );
      if (this.exitMark) {
        const m = this.exitMark.mark;
        if (this.pathBlocked(s.x, s.z, target, m))
          target = this.orbitPoint(m, this.exitMark.dir, s.x, s.z);
        else this.exitMark = null;
      }
      const down = !leg.upwind
        ? this.run?.headingToward(
            target,
            fromDir,
            s.x,
            s.z,
            s.heading,
            w.speed * KNOTS,
          )
        : null;
      if (down !== null && down !== undefined) {
        desired = down;
        this.debug = this.run!.label;
      } else {
        this.run?.leaveRun();
        desired = this.beat.headingToward(target, fromDir, s.x, s.z, s.heading);
        this.debug = this.beat.label;
      }
    }

    // Keep clear of boats that have right of way (a disciplined sailor looks further ahead and leaves more room).
    let avoiding = false;
    if (r.finishTime === null) {
      const way = giveWay(
        r,
        race,
        this.k,
        desired,
        sheet,
        fromDir,
        this.profile.discipline,
      );
      // Once giving way, hold the avoiding course a moment (longer for a disciplined sailor) instead of heading
      // straight back up as soon as the next look-ahead clears.
      if (way.rule !== null)
        this.keepClear = {
          until: this.time + 0.5 + 1.5 * this.profile.discipline,
          desired: way.desired,
          sheet: way.sheet,
        };
      else if (this.keepClear && this.time >= this.keepClear.until)
        this.keepClear = null;
      avoiding = this.keepClear !== null;
      ({ desired, sheet } = this.keepClear ?? way);
      if (way.rule) this.debug += ` avoid r${way.rule}`;
    }

    // Penalty turns: keep turning the same way (bear away first) until the turns are done.
    if (r.penalty && r.finishTime === null) {
      if (this.penaltyDir === 0) this.penaltyDir = tel.twa >= 0 ? -1 : 1;
      this.tackMachine.breakOff();
      this.run?.leaveRun();
      this.controls.sheet = tel.optimalSheet;
      this.controls.rudder =
        tel.speed < -0.05 ? -this.penaltyDir : this.penaltyDir;
      this.debug = "penalty";
      return this.controls;
    }
    this.penaltyDir = 0;

    // Trim: optimal plus a slowly wandering error that shrinks with technique.
    this.trimTimer -= dt;
    if (this.trimTimer <= 0) {
      this.trimTimer = 1.5 + this.rand() * 2;
      this.trimBias = (this.rand() - 0.5) * 0.8 * (1 - technique);
    }
    this.controls.sheet = clamp(sheet + this.trimBias, 0, 1);

    // Tack state machine: may commit to a tack, gybe round instead, or recover from irons.
    const helm = this.tackMachine.steer({
      time: this.time,
      dt,
      heading: s.heading,
      speed: tel.speed,
      desired,
      fromDir,
      boatWithin: (dist) => boatWithin(r, race, dist),
    });
    desired = helm.desired;
    if (helm.easeSheet) this.controls.sheet = 1;
    if (helm.gybeRound) this.debug += " (gybe round)";
    this.debug += ` [${this.tackMachine.mode}]`;
    // Helming: a pointing error that wanders slowly (technique) and a weave about the course (speed), both
    // costing pace; a top sailor steers almost straight at the right angle.
    if (
      this.tackMachine.mode === "sail" &&
      r.finishTime === null &&
      r.leg >= 0 &&
      !avoiding
    ) {
      desired +=
        this.wander(1, 0.07) * (1 - technique) * 18 * DEG +
        this.wander(2, 1.3) * (1 - speed) * 20 * DEG;
    }
    const err = angleDiff(s.heading, desired);
    const gain = 2.6;
    let rud = clamp(err * gain - s.yawRate * 0.6, -1, 1);
    // Going backward the rudder works the other way round.
    if (tel.speed < -0.05) rud = -rud;
    this.controls.rudder = rud;
    return this.controls;
  }

  /** A point on a small circle around the mark, leading the boat around it in the rounding direction. */
  private orbitPoint(mark: Point, dir: number, x: number, z: number): Point {
    const b = bearingTo(mark.x, mark.z, x, z);
    const d = distanceTo(mark, x, z);
    const lead = d < 20 ? 60 * DEG : 35 * DEG;
    const a = b + dir * lead;
    return {
      x: mark.x + Math.sin(a) * ORBIT_R * this.k,
      z: mark.z + Math.cos(a) * ORBIT_R * this.k,
    };
  }

  /** True if the straight path to `target` passes within 6 m of mark `m` (ahead of the boat). */
  private pathBlocked(x: number, z: number, target: Point, m: Point) {
    const dx = target.x - x,
      dz = target.z - z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return false;
    const t = ((m.x - x) * dx + (m.z - z) * dz) / len2;
    if (t <= 0 || t >= 1) return false;
    const px = x + dx * t - m.x,
      pz = z + dz * t - m.z;
    return px * px + pz * pz < 36;
  }
}

import { angleDiff, bearingTo, clamp, DEG, wrapPi } from "../core/math";
import type { Point } from "../race/Course";
import type { SailorProfile } from "../sailors/Sailors";

/** "sail": steer the wanted course; "gybe": a committed turn through dead downwind onto the other gybe. */
export type GybeMode = "sail" | "gybe";

/**
 * The true wind angle a skiff sails downwind at for the best VMG: 150 degrees in 7 kn of wind, 140 in 16 kn (the 29er's polar,
 * `npm run polar`), further from the beam in light air as the apparent wind swings less.
 */
export function runAngle(twsKn: number): number {
  return (150 - clamp((twsKn - 7) / 9, 0, 1) * 10) * DEG;
}

/**
 * The Racing AI's downwind tactics for a skiff, the beat's lane and layline logic mirrored about the wind: a skiff cannot
 * sail straight at a mark downwind (the gennaker is weak there and the boat slow), so it sails a VMG angle on one gybe and
 * gybes to the other, on the layline when the other gybe fetches the target, and not sooner than `minGap` s after the last.
 * Keeps the gybe it is on (`onStbd`, the wind over the starboard side) and switches only when the other points closer by a
 * hysteresis margin. A gybe is committed: the Helm holds the new heading until the bow is round (like a tack).
 *
 * Technique shapes it with draws from the sailor's own stream: the angle sailed wanders about the ideal by a bias that grows
 * as technique falls, and a poorer sailor is slower to gybe once the decision is made. Close to the target, or when the target
 * lies on a reach, the boat just heads for it.
 */
export class RunTactics {
  mode: GybeMode = "sail";
  /** What the last `headingToward` decided: "direct", "run stbd", "run port" or "gybe". */
  label = "";
  private onStbd: boolean | null = null;
  private lastGybe = -999;
  private lastRun = -999;
  private gybeHeading = 0;
  private gybeUntil = 0;
  /** A gybe decided but not yet started (the Helm's reaction), and the side it goes to. */
  private pendingAt = Infinity;
  private pendingStbd = false;
  private bias = 0;
  private biasTimer = 0;

  /** `now` is the Helm's clock in seconds; `lane` the narrowest zigzag (m); `near` the distance (m) inside which the boat heads straight for the target. */
  constructor(
    private profile: SailorProfile,
    private now: () => number,
    private rand: () => number,
    private lane: number,
    private near: number,
  ) {}

  /** Minimum seconds between gybes. */
  private get minGap(): number {
    return 14 + 8 * (1 - this.profile.technique);
  }

  /**
   * The heading to steer toward `p` on the run, or null when the target lies off the run (a reach to it, or close: steer
   * straight for it). `tws` is the true wind speed in knots.
   */
  headingToward(
    p: Point,
    fromDir: number,
    x: number,
    z: number,
    heading: number,
    tws: number,
  ): number | null {
    const time = this.now();
    const dist = Math.hypot(p.x - x, p.z - z);
    if (time >= this.biasTimer) {
      this.biasTimer = time + 4 + this.rand() * 4;
      this.bias =
        (this.rand() - 0.5) * 2 * (1 - this.profile.technique) * 14 * DEG;
    }
    const angle = clamp(runAngle(tws) + this.bias, 125 * DEG, 165 * DEG);
    const brg = bearingTo(x, z, p.x, p.z);
    const offWind = Math.abs(angleDiff(fromDir, brg));
    if (
      this.mode === "sail" &&
      (offWind < angle - 3 * DEG || dist < this.near)
    ) {
      this.label = "direct";
      this.pendingAt = Infinity;
      return null;
    }
    const stbd = wrapPi(fromDir - angle); // wind over the starboard side
    const port = wrapPi(fromDir + angle);
    if (this.onStbd === null || time - this.lastRun > 2) {
      this.onStbd =
        Math.abs(angleDiff(heading, stbd)) < Math.abs(angleDiff(heading, port));
    }
    this.lastRun = time;
    if (this.mode === "gybe") {
      if (
        Math.abs(angleDiff(heading, this.gybeHeading)) < 15 * DEG ||
        time > this.gybeUntil
      )
        this.mode = "sail";
      else {
        this.label = "gybe";
        return this.gybeHeading;
      }
    }
    const onStbd = this.onStbd;
    const errS = Math.abs(angleDiff(stbd, brg));
    const errP = Math.abs(angleDiff(port, brg));
    const hyst = Math.max(
      (20 + (1 - this.profile.tactics) * 12) * DEG,
      2 * Math.atan2(this.lane, dist),
    );
    // On the layline the other gybe fetches the target: gybe there whatever the margin.
    const LAID = 3 * DEG;
    const canGybe = time - this.lastGybe > this.minGap;
    let flipTo: boolean | null = null;
    if (onStbd && (errP + hyst < errS || errP < LAID) && canGybe)
      flipTo = false;
    else if (!onStbd && (errS + hyst < errP || errS < LAID) && canGybe)
      flipTo = true;
    if (flipTo !== null && this.pendingAt === Infinity) {
      // A poorer sailor is slower to start the gybe.
      this.pendingAt =
        time + (1 - this.profile.technique) * 4 * (0.5 + this.rand());
      this.pendingStbd = flipTo;
    } else if (flipTo === null) this.pendingAt = Infinity;
    if (time >= this.pendingAt) {
      this.pendingAt = Infinity;
      this.onStbd = this.pendingStbd;
      this.lastGybe = time;
      this.mode = "gybe";
      this.gybeHeading = this.onStbd ? stbd : port;
      this.gybeUntil = time + 8;
      this.label = "gybe";
      return this.gybeHeading;
    }
    this.label = onStbd ? "run stbd" : "run port";
    return onStbd ? stbd : port;
  }

  /** Leave the run (penalty turns, a leg that is not a run): the gybe is chosen afresh when running resumes. */
  leaveRun(): void {
    this.onStbd = null;
    this.mode = "sail";
    this.pendingAt = Infinity;
  }
}

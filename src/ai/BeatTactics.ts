import { angleDiff, bearingTo, DEG, wrapPi } from "../core/math";
import type { Point } from "../race/Course";
import type { SailorProfile } from "../sailors/Sailors";
import { CLOSE_HAULED } from "./angles";
import type { CourseSteering } from "./StartPlanning";

/**
 * The Racing AI's beat tactics: steering toward a point, beating close-hauled when it lies upwind.
 * Keeps the tack the boat is on (`onStbd`) and switches only when the other tack points closer by a
 * hysteresis margin, and not sooner than 11 s after the last tack. Owns the tack timer that start
 * planning and the tack state machine share.
 */
export class BeatTactics implements CourseSteering {
  /** Which tack the beat is on; null outside a beat (re-chosen from the heading when beating resumes). */
  private onStbd: boolean | null = null;
  private lastTack = -999;
  private lastBeat = -999;
  /** What the last `headingToward` decided: "direct", "beat stbd" or "beat port". */
  label = "";

  /** `now` is the Helm's clock in seconds. */
  constructor(private profile: SailorProfile, private now: () => number) {}

  /**
   * Heading toward a point, tacking upwind when it lies inside the no-go zone.
   * Picks the tack that points closer to the target; switches when the other tack is better by
   * a hysteresis margin (smaller for tactical sailors, so they tack on headers sooner).
   */
  headingToward(p: Point, fromDir: number, x: number, z: number, heading: number): number {
    const time = this.now();
    const brg = bearingTo(x, z, p.x, p.z);
    const offWind = Math.abs(angleDiff(fromDir, brg));
    if (offWind > CLOSE_HAULED + 3 * DEG) {
      this.label = "direct";
      return brg;
    }
    const stbd = wrapPi(fromDir - CLOSE_HAULED); // wind over starboard side
    const port = wrapPi(fromDir + CLOSE_HAULED);
    if (this.onStbd === null || time - this.lastBeat > 2) {
      // (Re)enter beating mode: keep whichever tack the boat is closest to now.
      this.onStbd = Math.abs(angleDiff(heading, stbd)) < Math.abs(angleDiff(heading, port));
    }
    this.lastBeat = time;
    const onStbd = this.onStbd;
    const errS = Math.abs(angleDiff(stbd, brg));
    const errP = Math.abs(angleDiff(port, brg));
    const hyst = (20 + (1 - this.profile.tactics) * 12) * DEG;
    const canTack = time - this.lastTack > 11;
    let useStbd = onStbd;
    if (onStbd && errP + hyst < errS && canTack) { useStbd = false; this.lastTack = time; }
    else if (!onStbd && errS + hyst < errP && canTack) { useStbd = true; this.lastTack = time; }
    this.onStbd = useStbd;
    this.label = useStbd ? "beat stbd" : "beat port";
    return useStbd ? stbd : port;
  }

  sinceTack(): number { return this.now() - this.lastTack; }

  tackNow(): void { this.lastTack = this.now(); }

  /** The Helm committed to a tack onto starboard (`stbd`) or port: the beat continues on that tack. */
  tackedOnto(stbd: boolean): void {
    this.onStbd = stbd;
    this.lastTack = this.now();
  }

  /** Leave the beat (penalty turns, stuck in irons): the tack is chosen afresh when beating resumes. */
  leaveBeat(): void { this.onStbd = null; }
}

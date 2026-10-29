import { angleDiff, DEG, wrapPi } from "../core/math";
import { CLOSE_HAULED } from "./angles";
import type { BeatTactics } from "./BeatTactics";

/** "sail": steer the wanted course; "tack": committed turn through the wind; "recover": stuck in irons. */
export type TackMode = "sail" | "tack" | "recover";

/** The Helm's situation this frame, as the tack state machine needs it. */
export type TackSituation = {
  /** The Helm's clock and this frame's step, in seconds. */
  time: number;
  dt: number;
  heading: number;
  /** Boat speed through the water (m/s; negative going backwards). */
  speed: number;
  /** The course the Helm wants before the state machine has its say. */
  desired: number;
  fromDir: number;
  /** True if another racing boat is within `dist` metres. */
  boatWithin: (dist: number) => boolean;
};

/** The state machine's decision: the heading to steer, whether to ease the sheet right out, whether it gybes round. */
export type TackSteer = { desired: number; easeSheet: boolean; gybeRound: boolean };

/**
 * The Racing AI's tacking: turning through the wind is a committed tack (without commitment the AI
 * dithers into irons). Too slow to tack, it bears away round (a gybe). It waits before tacking near
 * another boat (rule 13), but at most 6 s. Stuck head to wind, it bears away to recover.
 */
export class TackStateMachine {
  mode: TackMode = "sail";
  private tackHeading = 0;
  private tackUntil = 0;
  private tackWait = 0;

  /** `k` is the Helm's size factor: the rule-13 clearance scales with boat length. */
  constructor(private beat: Pick<BeatTactics, "tackedOnto" | "leaveBeat">, private k: number) {}

  steer(at: TackSituation): TackSteer {
    const { time, fromDir } = at;
    let desired = at.desired;
    let easeSheet = false, gybeRound = false;
    const twaNow = angleDiff(at.heading, fromDir);
    const twaGoal = angleDiff(desired, fromDir);
    const throughWind = (Math.sign(twaNow) || 1) !== (Math.sign(twaGoal) || 1) && Math.abs(twaNow) + Math.abs(twaGoal) < Math.PI;
    if (this.mode === "tack") {
      if (Math.abs(angleDiff(at.heading, this.tackHeading)) < 15 * DEG) this.mode = "sail";
      else if (time > this.tackUntil) this.mode = "recover";
      else desired = this.tackHeading;
    }
    if (this.mode === "sail" && throughWind) {
      const busy = at.boatWithin(7 * this.k);
      if (busy) this.tackWait += at.dt; else this.tackWait = 0;
      if (at.speed > 0.45 && (!busy || this.tackWait > 6)) {
        this.tackWait = 0;
        this.mode = "tack";
        this.tackHeading = Math.abs(twaGoal) < CLOSE_HAULED ? wrapPi(fromDir - Math.sign(twaGoal) * CLOSE_HAULED) : desired;
        this.tackUntil = time + 7;
        this.beat.tackedOnto(twaGoal > 0);
        desired = this.tackHeading;
      } else {
        // Too slow to tack: go round the other way, bearing away through downwind (a gybe).
        desired = wrapPi(fromDir + Math.PI - (Math.sign(twaNow) || 1) * 0.2);
        gybeRound = true;
      }
    }
    if (this.mode === "sail" && Math.abs(twaNow) < 35 * DEG && at.speed < 0.3) this.mode = "recover";
    if (this.mode === "recover") {
      desired = wrapPi(fromDir - (Math.sign(twaNow) || 1) * 75 * DEG);
      easeSheet = true;
      this.beat.leaveBeat();
      if (Math.abs(twaNow) > 60 * DEG) this.mode = "sail";
    }
    return { desired, easeSheet, gybeRound };
  }

  /** Break off any tack (for penalty turns) and leave the beat. */
  breakOff(): void {
    this.mode = "sail";
    this.beat.leaveBeat();
  }
}

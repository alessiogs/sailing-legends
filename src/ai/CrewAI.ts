import { clamp, DEG, rng } from "../core/math";
import { distanceTo, legTarget } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import type { Controls } from "../sailing/BoatPhysics";
import type { SailorProfile } from "./RacingAI";

/**
 * The crew of a two-person boat: trims the jib (or spinnaker), moves their weight in and out
 * (up to the trapeze), moves everything across after a tack or gybe, and hoists/drops the
 * spinnaker. How quickly and precisely they do it depends on their skill and on Crew Chemistry.
 *
 * `spiMode`: "auto" = the crew decides when to hoist/drop (career, crew in charge);
 * "command" = they wait for the helm's call (full boat control).
 */
export type SpiMode = "auto" | "command";

/** Crew Chemistry 0..100 for a pair: shared history, technique and reliability. */
export function chemistry(p: SailorProfile): number {
  const bond = p.bond ?? 60;
  return Math.round(0.5 * bond + 0.25 * p.technique * 100 + 0.25 * p.discipline * 100);
}

/** What the boat should be doing with the spinnaker right now (used by AI crews and to prompt players). */
export function wantSpinnaker(race: Race, r: Racer): boolean {
  const leg = r.leg >= 0 && r.leg < race.course.legs.length ? race.course.legs[r.leg] : null;
  if (!leg || leg.upwind || r.finishTime !== null || r.penalty) return false;
  const s = r.sim.state, t = r.sim.telemetry;
  const toMark = distanceTo(legTarget(leg), s.x, s.z);
  if (toMark < 26) return false;
  return Math.abs(t.twa) > 105 * DEG;
}

export class CrewAI {
  spiMode: SpiMode = "auto";
  /** The helm's call when spiMode = "command". */
  spiCommand = false;
  private rand: () => number;
  private reaction: number;
  private precision: number;
  private wrongFor = 0;
  private spiDecision = false;
  private spiTimer = 0;
  private trimBias = 0;
  private trimTimer = 0;
  private weightTarget = 0.3;
  private weightTimer = 0;
  readonly chem: number;

  constructor(public racer: Racer, public profile: SailorProfile, private race: Race, seed: number) {
    this.rand = rng(seed);
    this.chem = chemistry(profile);
    // Better chemistry: faster reactions to the helm and steadier trimming.
    this.reaction = 1.9 - this.chem * 0.015 + (1 - profile.technique) * 0.3;
    this.precision = clamp(0.35 * profile.technique + 0.65 * (this.chem / 100), 0, 1);
  }

  update(dt: number, c: Controls) {
    const r = this.racer, cls = r.sim.cls, s = r.sim.state, t = r.sim.telemetry;
    if (!cls.crew) return;

    // Move across after a tack or gybe, once the bow is through the wind and after a reaction delay.
    const wrong = (t.jib?.backed ?? false) || !(t.crew?.onWindward ?? true) || (s.spiHoist > 0.3 && (t.spi?.wrongSide ?? false));
    if (wrong && Math.abs(t.awa) > 22 * DEG) this.wrongFor += dt; else this.wrongFor = 0;
    if (this.wrongFor > this.reaction) { c.switchSide = true; this.wrongFor = 0; }

    // Spinnaker: decide (or follow the call), then act after a short delay.
    const want = this.spiMode === "auto" ? wantSpinnaker(this.race, r) : this.spiCommand;
    if (want !== this.spiDecision) {
      this.spiTimer += dt;
      if (this.spiTimer > this.reaction * 1.4) { this.spiDecision = want; this.spiTimer = 0; }
    } else this.spiTimer = 0;
    c.spi = this.spiDecision;

    // Trim: optimal plus a slowly wandering error that shrinks with precision.
    this.trimTimer -= dt;
    if (this.trimTimer <= 0) {
      this.trimTimer = 1.2 + this.rand() * 2;
      this.trimBias = (this.rand() - 0.5) * 0.3 * (1 - this.precision);
    }
    // When the helm dumps the main to slow down (pre-start), the jib is let go too.
    if (t.jib) c.jibSheet = c.sheet > 0.92 ? 1 : clamp(t.jib.optimal + this.trimBias, 0, 1);
    if (t.spi) c.spiSheet = clamp(t.spi.optimal + this.trimBias, 0, 1);

    // Weight: follow what the boat needs, updated every few tenths of a second.
    this.weightTimer -= dt;
    if (this.weightTimer <= 0) {
      this.weightTimer = 0.25 + (1 - this.precision) * 0.6;
      this.weightTarget = t.crew ? t.crew.ideal : 0;
    }
    c.crewOut = this.weightTarget;
  }
}

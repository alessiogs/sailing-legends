import { clamp, DEG, rng } from "../core/math";
import { distanceTo, legTarget } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import { isTwoPerson } from "../sailing/BoatClass";
import type { BoatState, Controls, Telemetry } from "../sailing/BoatPhysics";
import { crewChemistry, type SailorProfile } from "../sailors/Sailors";

/**
 * The Crew of a two-person boat: trims the jib (or spinnaker), moves their weight in and out
 * (up to the trapeze), moves everything across after a tack or gybe, and hoists/drops the
 * spinnaker. How quickly and precisely they do it depends on their skill and on Crew Chemistry.
 *
 * `spiMode`: "auto" = the Crew decides when to hoist/drop (Player Career, and every AI boat);
 * "command" = they wait for the Helm's call (Full Boat Control).
 */
export type SpiMode = "auto" | "command";

/** What the boat should be doing with the spinnaker right now (used by AI Crews and to prompt players). */
export function wantSpinnaker(race: Race, r: Racer): boolean {
  const leg = r.leg >= 0 && r.leg < race.course.legs.length ? race.course.legs[r.leg] : null;
  if (!leg || leg.upwind || r.finishTime !== null || r.penalty) return false;
  const s = r.sim.state, t = r.sim.telemetry;
  const toMark = distanceTo(legTarget(leg), s.x, s.z);
  if (toMark < 26) return false;
  return Math.abs(t.twa) > 105 * DEG;
}

/**
 * Is the Crew on the wrong side after a tack or gybe, with the bow through the wind, so they should move across?
 * Wrong side = a backed jib, the Crew's weight to leeward, or a hoisted spinnaker on the windward side.
 * The one check shared by the Crew AI, the browser autopilot and the HUD Partner call.
 */
export function crewOnWrongSide(sim: { state: BoatState; telemetry: Telemetry }): boolean {
  const s = sim.state, t = sim.telemetry;
  const wrong = (t.jib?.backed ?? false) || !(t.crew?.onWindward ?? true) || (s.spiHoist > 0.3 && (t.spi?.wrongSide ?? false));
  return wrong && Math.abs(t.awa) > 22 * DEG;
}

export class CrewAI {
  spiMode: SpiMode = "auto";
  /** The Helm's call when spiMode = "command". */
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
    this.chem = crewChemistry(profile);
    // Better chemistry: faster reactions to the Helm and steadier trimming.
    this.reaction = 1.9 - this.chem * 0.015 + (1 - profile.technique) * 0.3;
    this.precision = clamp(0.35 * profile.technique + 0.65 * (this.chem / 100), 0, 1);
  }

  update(dt: number, c: Controls) {
    const r = this.racer, cls = r.sim.cls, t = r.sim.telemetry;
    if (!isTwoPerson(cls)) return;

    // Move across after a tack or gybe, once the bow is through the wind and after a reaction delay.
    if (crewOnWrongSide(r.sim)) this.wrongFor += dt; else this.wrongFor = 0;
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
    // When the Helm dumps the main to slow down (pre-start), the jib is let go too.
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

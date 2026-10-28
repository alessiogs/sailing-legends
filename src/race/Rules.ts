import { angleDiff, DEG, dirX, dirZ } from "../core/math";
import type { BoatSim } from "../sailing/BoatPhysics";

/**
 * A simplified subset of the Racing Rules of Sailing (Part 2), decided at the moment of contact:
 *  - Rule 13: a boat that is tacking (between head-to-wind and close-hauled) keeps clear.
 *  - Rule 10: on opposite tacks, the port-tack boat keeps clear of the starboard-tack boat.
 *  - Rule 12: on the same tack, not overlapped, the boat clear astern keeps clear.
 *  - Rule 11: on the same tack, overlapped, the windward boat keeps clear.
 *  - Rule 31: touching a mark (or the committee boat) is a breach.
 * Penalties (Rule 44): two turns (720°) for a Part 2 breach, one turn (360°) for touching a mark.
 * Not modelled yet: mark-room (18), changing course near a right-of-way boat (16), proper course.
 */
export type Verdict = { atFault: 0 | 1; rule: string; why: string } | null;


/** +1 starboard tack (wind over the starboard side), -1 port tack. */
export function tackOf(sim: BoatSim): number {
  return sim.telemetry.twa >= 0 ? 1 : -1;
}

export function isTacking(sim: BoatSim): boolean {
  return Math.abs(sim.telemetry.twa) < 33 * DEG;
}

/** True if boat b is clear astern of boat a (b's bow behind a line abeam from a's stern). */
export function clearAstern(a: BoatSim, b: BoatSim): boolean {
  const fx = Math.sin(a.state.heading), fz = Math.cos(a.state.heading);
  const ha = a.cls.length / 2, hb = b.cls.length / 2;
  const sternX = a.state.x - fx * ha, sternZ = a.state.z - fz * ha;
  const bowX = b.state.x + Math.sin(b.state.heading) * hb;
  const bowZ = b.state.z + Math.cos(b.state.heading) * hb;
  return (bowX - sternX) * fx + (bowZ - sternZ) * fz < 0;
}

/** Which of two boats had to keep clear, given the mean wind direction (for windward/leeward). */
export function judge(a: BoatSim, b: BoatSim, windDir: number): Verdict {
  const ta = isTacking(a), tb = isTacking(b);
  if (ta !== tb) return { atFault: ta ? 0 : 1, rule: "13", why: "stava virando" };
  if (ta && tb) return null;
  const tackA = tackOf(a), tackB = tackOf(b);
  if (tackA !== tackB) return { atFault: tackA < 0 ? 0 : 1, rule: "10", why: "mure a sinistra contro mure a dritta" };
  if (clearAstern(a, b)) return { atFault: 1, rule: "12", why: "libera dietro" };
  if (clearAstern(b, a)) return { atFault: 0, rule: "12", why: "libera dietro" };
  const ux = dirX(windDir), uz = dirZ(windDir);
  const upA = a.state.x * ux + a.state.z * uz, upB = b.state.x * ux + b.state.z * uz;
  return { atFault: upA > upB ? 0 : 1, rule: "11", why: "sopravvento in ingaggio" };
}

/** Penalty turns still owed by a boat. Turns count in one direction; tacks and gybes are part of it. */
export type Penalty = { needed: number; turned: number; lastHeading: number; reason: string };

export function newPenalty(turns: number, heading: number, reason: string): Penalty {
  return { needed: turns * 2 * Math.PI, turned: 0, lastHeading: heading, reason };
}

/** Advances a penalty; returns true when it has been completed. */
export function trackPenalty(p: Penalty, heading: number): boolean {
  p.turned += angleDiff(p.lastHeading, heading);
  p.lastHeading = heading;
  return Math.abs(p.turned) >= p.needed - 5 * DEG;
}

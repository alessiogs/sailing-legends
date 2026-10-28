import { angleDiff, bearingTo, clamp, DEG, wrapPi } from "../core/math";
import type { Race, Racer } from "../race/Race";
import { judge, type RightOfWayRule } from "../race/Rules";

/** A course after giving way: the heading and sheet to use, and the rule we keep clear under (null if none). */
export type GiveWay = { desired: number; sheet: number; rule: RightOfWayRule | null };

/**
 * Look a few seconds ahead for a boat we'd hit; if the rules make us the give-way boat, act:
 * duck behind a starboard-tacker (rule 10), luff away from a leeward boat (rule 11) or slow down
 * when coming up from clear astern (rule 12).
 * `k` is the Helm's size factor: the look-ahead distances scale with boat length.
 */
export function giveWay(me: Racer, race: Race, k: number, desired: number, sheet: number, fromDir: number): GiveWay {
  const s = me.sim.state;
  let worst: { o: Racer; t: number } | null = null;
  for (const o of race.racers) {
    if (o === me || o.finishTime !== null) continue;
    const os = o.sim.state;
    const dx = os.x - s.x, dz = os.z - s.z;
    if (dx * dx + dz * dz > 14 * 14 * k * k) continue;
    const rvx = os.vx - s.vx, rvz = os.vz - s.vz;
    const rv2 = rvx * rvx + rvz * rvz;
    const t = rv2 > 1e-4 ? clamp(-(dx * rvx + dz * rvz) / rv2, 0, 5) : 0;
    const cx = dx + rvx * t, cz = dz + rvz * t;
    if (Math.hypot(cx, cz) > 4 * k) continue;
    if (!worst || t < worst.t) worst = { o, t };
  }
  if (!worst) return { desired, sheet, rule: null };
  const v = judge(me.sim, worst.o.sim, race.course.windDir);
  if (!v || v.atFault !== 0) return { desired, sheet, rule: null };
  const twa = angleDiff(s.heading, fromDir);
  const side = Math.sign(twa) || 1;
  if (v.rule === "10") {
    // Duck: steer for a point well behind the other boat's stern (at least 30° below our course).
    const os = worst.o.sim.state;
    const sx = os.x - Math.sin(os.heading) * 5, sz = os.z - Math.cos(os.heading) * 5;
    const behind = bearingTo(s.x, s.z, sx, sz);
    const minAway = Math.min(170 * DEG, Math.abs(twa) + 30 * DEG);
    const away = Math.max(minAway, Math.abs(angleDiff(fromDir, behind)));
    return { desired: wrapPi(fromDir - side * Math.min(170 * DEG, away)), sheet, rule: v.rule };
  }
  if (v.rule === "11") {
    // Windward boat: head up toward the wind, but not into the no-go zone.
    return { desired: wrapPi(fromDir - side * Math.max(42 * DEG, Math.abs(twa) - 18 * DEG)), sheet, rule: v.rule };
  }
  if (v.rule === "12") return { desired, sheet: Math.min(1, sheet + 0.4), rule: v.rule };
  return { desired, sheet, rule: v.rule };
}

/** Another racing boat within `dist` metres (don't tack into it: rule 13). */
export function boatWithin(me: Racer, race: Race, dist: number): boolean {
  const s = me.sim.state;
  return race.racers.some(o => o !== me && o.finishTime === null &&
    Math.hypot(o.sim.state.x - s.x, o.sim.state.z - s.z) < dist);
}

import { DEG, dirX, dirZ, segmentsCross } from "../core/math";
import { CrewAI } from "../ai/CrewAI";
import { CREWS, EXTRA_HELM, RacingAI, RIVALS, type SailorProfile } from "../ai/RacingAI";
import { OPTIMIST, type BoatClass } from "../sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../sailing/BoatPhysics";
import { WindField } from "../sailing/Wind";
import { makeWindwardLeeward } from "./Course";
import { Race, type Racer, type Sailor } from "./Race";

/**
 * Everything that makes up one race, with no rendering: wind, course, boats, AI and rules.
 * It runs at a fixed timestep, so the same code drives the browser game and headless tests.
 */
export const FIXED_DT = 1 / 60;

const PLAYER: Sailor = { kind: "player" };
const aiSailor = (profile: SailorProfile): Sailor => ({ kind: "ai", name: profile.name });

export type SessionOptions = {
  seed?: number;
  windKn?: number;
  countdown?: number;
  rivals?: SailorProfile[];
  boatClass?: BoatClass;
  /** Include a player-controlled boat (false for AI-only test races). */
  withPlayer?: boolean;
  /** Two-person classes: what the player does, and who sails with them. */
  role?: PlayerRole;
  partner?: SailorProfile;
};

/**
 * "skipper": you helm and trim the main; your crew decides the rest (career mode, your role only).
 * "crew": your partner helms; you trim jib/spinnaker, move your weight and do the manoeuvres.
 * "full": you helm and call every manoeuvre (spinnaker up/down); the crew carries them out.
 */
export type PlayerRole = "skipper" | "crew" | "full";

export class RaceSession {
  wind: WindField;
  race: Race;
  player: Racer | null = null;
  ais: RacingAI[] = [];
  crews: CrewAI[] = [];
  /** The player's partner: helms when the player is crew, crews when the player helms. */
  partnerHelm: RacingAI | null = null;
  partnerCrew: CrewAI | null = null;
  role: PlayerRole = "skipper";
  partner: SailorProfile | null = null;
  playerControls: Controls = { rudder: 0, sheet: 0.55, jibSheet: 0.5, spiSheet: 0.5, crewOut: 0.3, spi: false };
  private acc = 0;

  constructor(opts: SessionOptions = {}) {
    const seed = opts.seed ?? 11;
    const cls = opts.boatClass ?? OPTIMIST;
    this.wind = new WindField({ seed, meanDirDeg: 0, meanSpeedKn: opts.windKn ?? 11 });
    const two = !!cls.crew;
    const course = two
      ? makeWindwardLeeward(this.wind.meanDir, { beat: 125, lineHalf: 34, run: 50 })
      : makeWindwardLeeward(this.wind.meanDir);
    this.race = new Race(course, opts.countdown ?? 45);
    const scale = two ? 1.4 : 1;

    const down = (d: number) => ({ x: -dirX(course.windDir) * d, z: -dirZ(course.windDir) * d });
    let rivals = opts.rivals ?? RIVALS;
    if (opts.withPlayer !== false) {
      const p = down(30 * scale);
      const sim = new BoatSim(cls, createBoat(p.x + 6 * scale, p.z, course.windDir - 70 * DEG));
      if (two) {
        this.role = opts.role ?? "skipper";
        this.partner = opts.partner ?? rivals[1];
        const pn = this.partner.name, partner = aiSailor(this.partner);
        this.player = this.race.add("player", this.role === "crew" ? { helm: partner, crew: PLAYER } : { helm: PLAYER, crew: partner }, sim, true);
        if (this.role === "crew") {
          this.partnerHelm = new RacingAI(this.player, this.partner, this.race, seed * 17, 3);
        } else {
          this.partnerCrew = new CrewAI(this.player, this.partner, this.race, seed * 19);
          this.partnerCrew.spiMode = this.role === "full" ? "command" : "auto";
        }
        // The partner is on our boat, so race against the others plus a new helm.
        rivals = rivals.filter(r => r.name !== pn).concat([EXTRA_HELM]);
      } else {
        this.player = this.race.add("player", { helm: PLAYER, crew: null }, sim, true);
      }
    }
    rivals.forEach((prof, i) => {
      const p = down((24 + i * 2) * scale);
      const sim = new BoatSim(cls, createBoat(p.x + (-16 + i * 14) * scale, p.z, course.windDir - 80 * DEG));
      const crew = two ? CREWS[i % CREWS.length] : null;
      const racer = this.race.add(`ai${i}`, { helm: aiSailor(prof), crew: crew && aiSailor(crew) }, sim);
      const ai = new RacingAI(racer, prof, this.race, seed * 31 + i * 7, i);
      ai.placeAtStart();
      this.ais.push(ai);
      if (crew) this.crews.push(new CrewAI(racer, crew, this.race, seed * 37 + i * 11));
    });
  }

  /** Advance by a variable frame time using fixed sub-steps. Returns the number of steps taken. */
  advance(frameDt: number): number {
    this.acc += Math.min(frameDt, 0.25);
    let n = 0;
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
      n++;
    }
    return n;
  }

  /** Fraction of a step left in the accumulator (for render interpolation). */
  get alpha() {
    return this.acc / FIXED_DT;
  }

  step(dt: number) {
    this.wind.update(dt);
    this.ais.forEach((ai, i) => {
      const c = ai.update(dt, this.wind);
      this.crews[i]?.update(dt, c);
      ai.racer.sim.step(dt, c, this.wind);
    });
    if (this.player) {
      const pc = this.playerControls;
      if (this.partnerHelm) {
        const c = this.partnerHelm.update(dt, this.wind);
        pc.rudder = c.rudder;
        pc.sheet = c.sheet;
      }
      this.partnerCrew?.update(dt, pc);
      this.player.sim.step(dt, pc, this.wind);
    }
    this.resolveCollisions();
    this.race.update(dt);
  }

  /**
   * Contacts. Each hull is a capsule (bow-stern segment, half-beam radius); marks are discs and the
   * committee boat is a larger capsule. Overlaps are pushed apart, closing speed is removed, and the
   * race is told so it can apply the rules.
   */
  private resolveCollisions() {
    const rs = this.race.racers;
    const c = this.race.course;
    const marks = c.marks.map((m, i) => ({ p: m, r: i < 2 ? 0.75 : 0.4, key: `m${i}` }));
    marks.push({ p: c.pin, r: 0.45, key: "pin" });
    const finishIdx = c.legs.findIndex(l => l.kind === "finish");
    // Rule 31 only covers the marks of the leg being sailed (and the start marks before starting).
    const counts = (r: Racer, key: string) => {
      if (key === "pin" || key === "committee") return r.leg === -1;
      if (key === "m0") return r.leg === 0;
      if (key === "m1") return r.leg === 1;
      return r.leg === finishIdx;
    };
    const cbx = dirX(c.windDir) * 3.2, cbz = dirZ(c.windDir) * 3.2;
    for (let i = 0; i < rs.length; i++) {
      const A = rs[i], a = A.sim.state;
      for (let j = i + 1; j < rs.length; j++) {
        const B = rs[j], b = B.sim.state;
        if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
        const h = hullSegment(a, A.sim.cls), k = hullSegment(b, B.sim.cls);
        const q = closestSegSeg(h, k);
        const minD = hullR(A.sim.cls) + hullR(B.sim.cls);
        if (q.d < minD) {
          let nx = q.qx - q.px, nz = q.qz - q.pz;
          const len = Math.hypot(nx, nz) || 1;
          nx /= len; nz /= len;
          if (q.d < 1e-4) { nx = b.x - a.x; nz = b.z - a.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
          const push = (minD - q.d) / 2;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (closing < 0) {
            a.vx += nx * closing * 0.5; a.vz += nz * closing * 0.5;
            b.vx -= nx * closing * 0.5; b.vz -= nz * closing * 0.5;
          }
          this.race.contact(A, B);
        }
      }
      const h = hullSegment(a, A.sim.cls);
      const HULL_R = hullR(A.sim.cls);
      for (const m of marks) {
        const q = closestPointSeg(m.p.x, m.p.z, h);
        const minD = m.r + HULL_R;
        if (q.d < minD) this.pushOut(A, q.px, q.pz, m.p.x, m.p.z, minD - q.d, counts(A, m.key) ? m.key : null);
      }
      // Committee boat: a capsule lying along the wind.
      const cb = { ax: c.committee.x - cbx, az: c.committee.z - cbz, bx: c.committee.x + cbx, bz: c.committee.z + cbz };
      const q = closestSegSeg(h, cb);
      if (q.d < 1.3 + HULL_R) this.pushOut(A, q.px, q.pz, q.qx, q.qz, 1.3 + HULL_R - q.d, counts(A, "committee") ? "committee" : null);
    }
  }

  /** Push boat A away from obstacle point (ox, oz) as seen from its hull point (px, pz). */
  private pushOut(A: Racer, px: number, pz: number, ox: number, oz: number, depth: number, key: string | null) {
    const a = A.sim.state;
    let nx = px - ox, nz = pz - oz;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    a.x += nx * depth; a.z += nz * depth;
    const into = a.vx * nx + a.vz * nz;
    if (into < 0) { a.vx -= nx * into; a.vz -= nz * into; }
    if (key) this.race.markTouch(A, key);
  }
}

type Seg = { ax: number; az: number; bx: number; bz: number };

/** Hull capsule radius (about half the beam) and half-length of its centre segment. */
const hullR = (cls: BoatClass) => cls.beam * 0.44;
function hullSegment(s: { x: number; z: number; heading: number }, cls: BoatClass): Seg {
  const half = Math.max(0.3, cls.length / 2 - hullR(cls));
  const fx = Math.sin(s.heading) * half, fz = Math.cos(s.heading) * half;
  return { ax: s.x - fx, az: s.z - fz, bx: s.x + fx, bz: s.z + fz };
}

function closestPointSeg(px: number, pz: number, g: Seg) {
  const ex = g.bx - g.ax, ez = g.bz - g.az;
  const t = Math.max(0, Math.min(1, ((px - g.ax) * ex + (pz - g.az) * ez) / (ex * ex + ez * ez || 1)));
  const qx = g.ax + ex * t, qz = g.az + ez * t;
  return { px: qx, pz: qz, d: Math.hypot(px - qx, pz - qz) };
}

/** Closest points between two segments (crossing segments, otherwise endpoint-to-segment). */
function closestSegSeg(g: Seg, h: Seg) {
  if (segmentsCross(g.ax, g.az, g.bx, g.bz, h.ax, h.az, h.bx, h.bz)) {
    const mx = (g.ax + g.bx + h.ax + h.bx) / 4, mz = (g.az + g.bz + h.az + h.bz) / 4;
    return { px: mx, pz: mz, qx: mx, qz: mz, d: 0 };
  }
  let best = { px: 0, pz: 0, qx: 0, qz: 0, d: Infinity };
  const tryPair = (px: number, pz: number, qx: number, qz: number) => {
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best.d) best = { px, pz, qx, qz, d };
  };
  for (const [x, z] of [[g.ax, g.az], [g.bx, g.bz]]) { const q = closestPointSeg(x, z, h); tryPair(x, z, q.px, q.pz); }
  for (const [x, z] of [[h.ax, h.az], [h.bx, h.bz]]) { const q = closestPointSeg(x, z, g); tryPair(q.px, q.pz, x, z); }
  return best;
}

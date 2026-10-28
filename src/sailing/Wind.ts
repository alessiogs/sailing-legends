import { DEG, rng, wrapPi } from "../core/math";

/**
 * True wind field: a mean direction with slow oscillating shifts, plus moving puffs (gusts)
 * that drift downwind across the course. Fully deterministic for a given seed.
 *
 * `fromDir` is the compass bearing the wind blows FROM (0 = from +Z / north).
 */
export type WindSample = { fromDir: number; speed: number; puff: number };

export type Puff = {
  x: number;
  z: number;
  radius: number;
  /** Extra wind speed at the centre, m/s. */
  strength: number;
  /** Direction offset inside the puff (radians). */
  veer: number;
  /** Seconds since spawn, used to fade in/out. */
  age: number;
  life: number;
};

export class WindField {
  readonly meanDir: number;
  readonly meanSpeed: number;
  readonly puffs: Puff[] = [];
  time = 0;
  private rand: () => number;
  private phase: number[];

  constructor(opts: { seed?: number; meanDirDeg?: number; meanSpeedKn?: number; puffCount?: number } = {}) {
    this.rand = rng(opts.seed ?? 7);
    this.meanDir = (opts.meanDirDeg ?? 0) * DEG;
    this.meanSpeed = (opts.meanSpeedKn ?? 11) / 1.943844;
    this.phase = [this.rand() * 6.28, this.rand() * 6.28, this.rand() * 6.28];
    const n = opts.puffCount ?? 6;
    for (let i = 0; i < n; i++) this.puffs.push(this.spawnPuff(true));
  }

  /** Course area in which puffs live (x range, z range). */
  bounds = { minX: -160, maxX: 160, minZ: -120, maxZ: 260 };

  private spawnPuff(anywhere: boolean): Puff {
    const b = this.bounds;
    // Puffs enter from the windward (upwind) edge of the course and drift downwind.
    const upwindX = Math.sin(this.meanDir), upwindZ = Math.cos(this.meanDir);
    let x = b.minX + this.rand() * (b.maxX - b.minX);
    let z = b.minZ + this.rand() * (b.maxZ - b.minZ);
    if (!anywhere) {
      x += upwindX * 140;
      z += upwindZ * 140;
    }
    return {
      x, z,
      radius: 28 + this.rand() * 34,
      strength: (0.9 + this.rand() * 1.6),
      veer: (this.rand() - 0.5) * 14 * DEG,
      age: anywhere ? this.rand() * 40 : 0,
      life: 70 + this.rand() * 60,
    };
  }

  /** Oscillating component of the direction, in radians. Two periods give a natural-looking shift pattern. */
  shift(t = this.time): number {
    return (
      7 * DEG * Math.sin((t / 95) * Math.PI * 2 + this.phase[0]) +
      4 * DEG * Math.sin((t / 41) * Math.PI * 2 + this.phase[1])
    );
  }

  update(dt: number) {
    this.time += dt;
    const dir = this.meanDir + this.shift();
    // Wind blows toward dir + PI.
    const vx = -Math.sin(dir), vz = -Math.cos(dir);
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const drift = this.meanSpeed * 0.55;
      p.x += vx * drift * dt;
      p.z += vz * drift * dt;
      p.age += dt;
      const b = this.bounds;
      const out = p.x < b.minX - 120 || p.x > b.maxX + 120 || p.z < b.minZ - 120 || p.z > b.maxZ + 120;
      if (p.age > p.life || out) this.puffs[i] = this.spawnPuff(false);
    }
  }

  /** Puff fade factor 0..1 over the puff lifetime. */
  static puffFade(p: Puff) {
    const fadeIn = Math.min(1, p.age / 8);
    const fadeOut = Math.min(1, (p.life - p.age) / 10);
    return Math.max(0, Math.min(fadeIn, fadeOut));
  }

  sample(x: number, z: number): WindSample {
    let speed = this.meanSpeed * (1 + 0.05 * Math.sin(this.time * 0.21 + this.phase[2]));
    let dir = this.meanDir + this.shift();
    let puffAmt = 0;
    for (const p of this.puffs) {
      const dx = x - p.x, dz = z - p.z;
      const d2 = (dx * dx + dz * dz) / (p.radius * p.radius);
      if (d2 > 4) continue;
      const w = Math.exp(-d2 * 1.6) * WindField.puffFade(p);
      speed += p.strength * w;
      dir += p.veer * w;
      puffAmt = Math.max(puffAmt, w * (p.strength / 2.5));
    }
    return { fromDir: wrapPi(dir), speed, puff: Math.min(1, puffAmt) };
  }
}

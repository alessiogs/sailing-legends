import { DEG } from "../core/math";

/**
 * Wave spectrum shared by the GPU ocean shader and the CPU (boat bobbing), so boats ride the same
 * surface that is drawn. Gerstner waves; small amplitudes = sheltered race area in a moderate breeze.
 */
export type Wave = { dirX: number; dirZ: number; k: number; amp: number; omega: number; steep: number };

const G = 9.81;

export function makeWaves(windFromDir: number, windKn: number): Wave[] {
  const scale = Math.min(1.6, Math.max(0.4, windKn / 11));
  // Waves travel downwind (opposite to where the wind comes from), with some spread.
  const travel = windFromDir + Math.PI;
  const spec: [number, number, number, number][] = [
    // [direction offset deg, wavelength m, amplitude m, steepness 0..1]
    [0, 11, 0.13, 0.55],
    [-22, 6.5, 0.08, 0.6],
    [27, 3.8, 0.045, 0.6],
    [-8, 2.2, 0.025, 0.5],
  ];
  return spec.map(([off, len, amp, steep]) => {
    const d = travel + off * DEG;
    const k = (2 * Math.PI) / len;
    return { dirX: Math.sin(d), dirZ: Math.cos(d), k, amp: amp * scale, omega: Math.sqrt(G * k), steep };
  });
}

/** Approximate surface height and slope at (x, z) — ignores the small horizontal Gerstner shift. */
export function surfaceAt(waves: Wave[], x: number, z: number, t: number) {
  let h = 0, dx = 0, dz = 0;
  for (const w of waves) {
    const ph = w.k * (w.dirX * x + w.dirZ * z) - w.omega * t;
    h += w.amp * Math.sin(ph);
    const c = w.amp * w.k * Math.cos(ph);
    dx += c * w.dirX;
    dz += c * w.dirZ;
  }
  return { h, dx, dz };
}

/** Pack waves for the shader: waveA = (dirX, dirZ, k, amp), waveB = (omega, steep, 0, 0). */
export function packWaves(waves: Wave[]) {
  const a: number[] = [], b: number[] = [];
  for (const w of waves) {
    a.push(w.dirX, w.dirZ, w.k, w.amp);
    b.push(w.omega, w.steep / (w.k * w.amp * waves.length), 0, 0);
  }
  return { a, b };
}

/**
 * `optimalSheetFor` gives exactly the sheet that sampling `sailForce` at every one of its 41 steps gives. The
 * reference below is a copy of that earlier search, kept as the record of the answer it must keep giving.
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { I420, OPTIMIST, type SailSpec } from "../src/sailing/BoatClass";
import { optimalSheetFor, sailForce } from "../src/sailing/BoatPhysics";

/** The spinnaker's effect by apparent wind angle (as in BoatPhysics). */
const spiEffect = (awa: number) => Math.min(1, Math.max(0, (Math.abs(awa) / DEG - 55) / 30));

/** optimalSheetFor before it was sped up: every step through sailForce, the first best kept. */
function bruteForce(spec: SailSpec, awa: number, aws: number, cap: number, isSpi = false): number {
  const side = awa >= 0 ? -1 : 1;
  let best = 0, bestDrive = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const s = i / 40;
    const f = sailForce(spec, awa, Math.max(aws, 0.5), s, side);
    let d = f.drive;
    if (Math.abs(f.side) > cap) d *= Math.sqrt(cap / Math.abs(f.side));
    if (isSpi) d *= spiEffect(awa);
    if (d > bestDrive + 1e-6) { bestDrive = d; best = s; }
  }
  return best;
}

type Case = { name: string; spec: SailSpec; cap: number; isSpi: boolean };
const CASES: Case[] = [
  { name: "Optimist main", spec: OPTIMIST.main, cap: 400, isSpi: false },
  { name: "420 main", spec: I420.main, cap: 500, isSpi: false },
  { name: "420 main, no cap", spec: I420.main, cap: 1e9, isSpi: false },
  { name: "420 jib", spec: I420.jib!, cap: 200, isSpi: false },
  { name: "420 jib, tight cap", spec: I420.jib!, cap: 20, isSpi: false },
  { name: "420 spinnaker", spec: I420.spinnaker!, cap: 1e9, isSpi: true },
];
const SPEEDS = [0, 0.3, 1, 2.5, 4, 6, 8.5, 12, 15];

describe("optimalSheetFor", () => {
  for (const c of CASES) {
    it(`${c.name}: the same sheet as sampling every step, all round the compass`, () => {
      let maxErr = 0;
      for (let k = 0; k <= 3600; k++) {
        const awa = -Math.PI + k * (2 * Math.PI / 3600);
        for (const aws of SPEEDS) {
          maxErr = Math.max(maxErr, Math.abs(optimalSheetFor(c.spec, awa, aws, c.cap, c.isSpi) - bruteForce(c.spec, awa, aws, c.cap, c.isSpi)));
        }
      }
      expect(maxErr).toBe(0);
    });

    it(`${c.name}: the same sheet with the wind exactly at a sampled sheet angle`, () => {
      // Where the search stops early: the sheet angle reaches the apparent wind.
      for (let i = 0; i <= 40; i++) {
        const a = (c.spec.minSheetDeg + (i / 40) * (c.spec.maxSheetDeg - c.spec.minSheetDeg)) * DEG;
        for (const awa of [a, -a, a * (1 + 1e-12), a * (1 - 1e-12)]) {
          for (const aws of [1, 5, 10]) {
            expect(optimalSheetFor(c.spec, awa, aws, c.cap, c.isSpi), `awa ${awa}`).toBe(bruteForce(c.spec, awa, aws, c.cap, c.isSpi));
          }
        }
      }
    });
  }

  it("the same sheet head to wind, dead downwind and at ±180°", () => {
    for (const c of CASES) {
      for (const awa of [0, -0, Math.PI, -Math.PI, 1e-9, -1e-9, Math.PI - 1e-9]) {
        expect(optimalSheetFor(c.spec, awa, 6, c.cap, c.isSpi), `${c.name} awa ${awa}`).toBe(bruteForce(c.spec, awa, 6, c.cap, c.isSpi));
      }
    }
  });

  it("a spinnaker with the wind forward of the beam is sheeted in", () => {
    for (const deg of [0, 20, 40, 55, -55]) expect(optimalSheetFor(I420.spinnaker!, deg * DEG, 6, 1e9, true)).toBe(0);
  });

  it("eases the main further as the wind goes aft", () => {
    const at = (deg: number) => optimalSheetFor(OPTIMIST.main, deg * DEG, 5, 400);
    expect(at(40) < at(90)).toBe(true);
    expect(at(90) < at(150)).toBe(true);
  });
});

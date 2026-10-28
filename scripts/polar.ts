/**
 * Speed table (polar) for each boat class: holds a fixed true-wind angle with ideal trim and crew weight,
 * and prints the steady speed. Run with `npm run polar` after changing BoatClass or BoatPhysics.
 */
import { DEG, KNOTS } from "../src/core/math";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

for (const cls of [OPTIMIST, I420]) {
  console.log(`\n${cls.name}`);
  for (const tws of [7, 11, 16]) {
    const cells: string[] = [];
    for (const twa of [40, 45, 50, 60, 90, 120, 150, 180]) {
      for (const spi of cls.spinnaker && twa >= 120 ? [false, true] : [false]) {
        const wind = new WindField({ puffCount: 0, meanSpeedKn: tws });
        wind.shift = () => 0;
        const sim = new BoatSim(cls, createBoat(0, 0, -twa * DEG));
        const c: Controls = { rudder: 0, sheet: 0.5, jibSheet: 0.5, spiSheet: 0.5, spi, crewOut: 0.3 };
        for (let i = 0; i < 60 * 40; i++) {
          sim.state.heading = -twa * DEG;
          sim.state.yawRate = 0;
          const t = sim.telemetry;
          c.sheet = t.optimalSheet;
          c.jibSheet = t.jib?.optimal ?? 0.5;
          c.spiSheet = t.spi?.optimal ?? 0.5;
          c.crewOut = t.crew?.ideal ?? 0;
          sim.step(1 / 60, c, wind);
        }
        cells.push(`${twa}°${spi ? "+spi" : ""} ${(sim.telemetry.speed * KNOTS).toFixed(1)}`);
      }
    }
    console.log(`  ${String(tws).padStart(2)} kn | ${cells.join(" · ")}`);
  }
}

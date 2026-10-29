/** The wind and the seed of each Race of a Regatta, drawn from the Career seed: the Races of one Regatta differ. */
import { rng } from "../core/math";
import { mixSeed } from "./Seeds";

/** The base winds of the Races of a Regatta, in knots: light, medium and strong, in an order that varies by Regatta. */
const BASE_WINDS: readonly number[] = [7, 11, 15];

/** The mean wind of Race `raceIndex` of a Regatta, in knots: its base wind plus -1, 0 or +1. Always 6..16. */
export function raceWindKn(seed: number, season: number, regattaIndex: number, raceIndex: number): number {
  const rand = rng(mixSeed(seed, season, regattaIndex, 2));
  const order = [...BASE_WINDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const jitter = [0, 0, 0].map(() => Math.floor(rand() * 3) - 1);
  const i = raceIndex % order.length;
  return order[i] + jitter[i];
}

/** The seed of Race `raceIndex` of a Regatta, for its `RaceSession`: a whole number from 1 to 99999. */
export function raceSeed(seed: number, season: number, regattaIndex: number, raceIndex: number): number {
  return 1 + mixSeed(seed, season, regattaIndex, 3, raceIndex) % 99999;
}

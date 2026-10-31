/**
 * The Career's sailor pool: the named Rivals plus generated sailors, all drawn once from the Career seed and then
 * stored in the save (so they stay the same for the whole Career). Sailors are matched by `id`, never by name. No text
 * here (ADR 0001): a generated name is data, a proper name from the fixed list below.
 */
import { clamp, rng } from "../core/math";
import { RIVALS, type SailorProfile } from "../sailors/Sailors";
import type { RegattaLevel } from "./Calendar";
import { mixSeed } from "./Seeds";
import { levelRating, rivalStartRating } from "./Strength";

/** A sailor of the pool: a profile and the age they have in Season 1 (their age later is `ageInSeason(startingAge, season)`). */
export type PoolSailor = SailorProfile & { startingAge: number };

/** How many sailors are generated besides the Rivals. */
export const GENERATED_COUNT = 27;

/**
 * Italian first names for generated sailors (ASCII, so an id is the lower-case name). None is the name of a roster sailor
 * (the Rivals, the opponents' Crews, the extra Helm), so a name never means two people.
 */
const NAMES: readonly string[] = [
  "Alessandro", "Andrea", "Matteo", "Lorenzo", "Francesco", "Leonardo", "Davide", "Gabriele", "Riccardo", "Federico",
  "Simone", "Edoardo", "Filippo", "Giorgio", "Nicolo", "Emanuele", "Stefano", "Jacopo", "Alberto", "Daniele",
  "Michele", "Paolo", "Enrico", "Carlo", "Martina", "Chiara", "Francesca", "Sofia", "Alice", "Aurora",
  "Beatrice", "Elisa", "Valentina", "Giorgia", "Camilla", "Ginevra", "Emma", "Greta", "Ilaria", "Anna",
  "Caterina", "Matilde", "Viola", "Bianca", "Silvia", "Marta", "Irene", "Costanza",
];

/** The overall level of a sailor, 0..1: the mean of their four attributes. */
export function sailorRating(p: SailorProfile): number {
  return (p.technique + p.tactics + p.speed + p.discipline) / 4;
}

/** The four levels the generated sailors are spread over, club to international. */
const LEVELS: readonly RegattaLevel[] = ["club", "regional", "national", "international"];

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The pool of a Career: the three Rivals, then `GENERATED_COUNT` generated sailors, all with a starting age within two
 * years of the player's (never under 7). The generated ones are spread evenly over the four levels. The same seed and
 * age always give the same pool.
 */
export function generatePool(seed: number, playerAge: number): PoolSailor[] {
  const rand = rng(mixSeed(seed, 0x500c));
  const ageNearPlayer = () => Math.max(7, playerAge + Math.floor(rand() * 5) - 2);

  const names = [...NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }

  // The Rivals keep their character (the shape of their attributes) but start as the talented kids they are.
  const rivals = RIVALS.map((r): PoolSailor => {
    const startingAge = ageNearPlayer();
    const shift = rivalStartRating(startingAge) - sailorRating(r);
    const at = (v: number) => round2(clamp(v + shift, 0.1, 0.98));
    return { ...r, technique: at(r.technique), tactics: at(r.tactics), speed: at(r.speed), discipline: at(r.discipline), startingAge };
  });
  const generated = names.slice(0, GENERATED_COUNT).map((name, i): PoolSailor => {
    const startingAge = ageNearPlayer();
    const mean = levelRating(LEVELS[i % LEVELS.length], startingAge);
    const attribute = () => round2(clamp(mean + (rand() - 0.5) * 0.24, 0.1, 0.98));
    return {
      id: name.toLowerCase(), name,
      technique: attribute(), tactics: attribute(), speed: attribute(), discipline: attribute(),
      startingAge,
    };
  });
  return [...rivals, ...generated];
}

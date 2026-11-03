/**
 * How well an AI sailor hikes and rolls, by technique. The draws come from the caller's own stream, never from the
 * main one, so the start plan keeps its first two numbers.
 */
import { clamp } from "../core/math";

/** Roll quality 0..1 for a tack or gybe from a draw `u` in 0..1: 0.5 is Auto-hike's average, a skilled sailor beats it. */
export function rollQuality(technique: number, u: number): number {
  return clamp(0.3 + 0.55 * technique + (u - 0.5) * 0.35 * (1 - technique), 0, 1);
}

/** The error (in weight units, 0..1 for the whole range) of an AI sailor's hiking from a draw `u`; it shrinks to nothing at technique 1. */
export function hikeError(technique: number, u: number): number {
  return (u - 0.5) * 0.35 * (1 - technique);
}

/** Seconds a sailor takes to notice that the weight the boat needs has changed (the lag on puffs). */
export function hikeLag(technique: number): number {
  return 0.2 + (1 - technique) * 0.6;
}

/**
 * How much of the hiking error shows now: little in steady wind, most in a puff, and less in light air where there is
 * little weight to misplace. Weaker sailors lose mainly in the puffs.
 */
export function hikeScale(puff: number, twsKn: number): number {
  return (0.2 + 0.8 * clamp(puff * 1.5, 0, 1)) * clamp((twsKn - 5) / 7, 0.2, 1);
}

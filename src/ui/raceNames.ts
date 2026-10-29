/**
 * Names in a race (ADR 0001): the simulation knows legs by `LegId` and boats by the sailors on board; this module
 * turns them into catalog text for the HUD, the standings, the boat tags, race events and the results.
 */
import { t } from "../i18n";
import type { LegId } from "../race/Course";
import type { Racer, Sailor } from "../race/Race";

const LEG = {
  mark1: "race.leg.mark1",
  mark2: "race.leg.mark2",
  finish: "race.leg.finish",
} as const satisfies Record<LegId, string>;

/** A leg's name, as the HUD target and leg messages show it ("Boa 1", "Arrivo"). */
export function legName(leg: { id: LegId }): string {
  return t(LEG[leg.id]);
}

function sailorName(sailor: Sailor): string {
  return sailor.kind === "player" ? t("race.player") : sailor.name;
}

/** A boat's name: its Helm, or "Helm/Crew" on two-person classes ("Tu", "Tu/Giulia", "Giulia/Tu"). */
export function racerName(racer: Racer): string {
  const { helm, crew } = racer.sailors;
  return crew ? t("race.pair", { helm: sailorName(helm), crew: sailorName(crew) }) : sailorName(helm);
}

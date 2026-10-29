/**
 * Race event text: every race event kind, formatted through the Italian catalog, reads word for word as the
 * simulation wrote it before events became data (ADR 0001). The expected strings were captured from the old
 * `RaceEvent.text` of the golden races (plus the cases they never hit: a single turn, rule 12, DSQ).
 *
 * `CASES` is keyed by event kind, so a new kind without a case here fails the type-check.
 */
import { describe, expect, it } from "vitest";
import { makeWindwardLeeward } from "../src/race/Course";
import { Race, type RaceEvent } from "../src/race/Race";
import { OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat } from "../src/sailing/BoatPhysics";
import { eventText } from "../src/ui/raceEventText";

const race = new Race(makeWindwardLeeward(0));
const boat = () => new BoatSim(OPTIMIST, createBoat(0, 0, 0));
const player = race.add("player", { helm: { kind: "player" }, crew: { kind: "ai", name: "Giulia" } }, boat(), true);
const marco = race.add("ai0", { helm: { kind: "ai", name: "Marco" }, crew: { kind: "ai", name: "Tommaso" } }, boat());
const [mark1, mark2, finish] = race.course.legs;

type Case = [event: RaceEvent, text: string];
type Kind = RaceEvent["kind"];

const CASES: { [K in Kind]: Case[] } = {
  warning: [
    [{ kind: "warning", racer: player, seconds: 30 }, "30 secondi alla partenza"],
    [{ kind: "warning", racer: player, seconds: 10 }, "10 secondi alla partenza"],
    [{ kind: "warning", racer: player, seconds: 5 }, "5 secondi alla partenza"],
  ],
  gun: [[{ kind: "gun", racer: player }, "PARTENZA!"]],
  ocs: [[{ kind: "ocs", racer: marco }, "OCS! Partenza anticipata: torna sotto la linea"]],
  "ocs-cleared": [[{ kind: "ocs-cleared", racer: marco }, "Rientrato: ora puoi ripartire"]],
  start: [[{ kind: "start", racer: player, next: mark1 }, "Partito · Boa 1"]],
  rounded: [
    [{ kind: "rounded", racer: player, rounded: mark1, next: mark2 }, "Boa 1 girata · ora: Boa 2"],
    [{ kind: "rounded", racer: player, rounded: mark2, next: finish }, "Boa 2 girata · ora: Arrivo"],
  ],
  finish: [
    [{ kind: "finish", racer: player, place: 1 }, "ARRIVO! 1° posto"],
    [{ kind: "finish", racer: marco, place: 4 }, "ARRIVO! 4° posto"],
    [{ kind: "finish", racer: marco, place: null }, "ARRIVO, ma penalità non scontata: squalificato (DSQ)"],
  ],
  penalty: [
    [{ kind: "penalty", racer: marco, turns: 2, rule: "10" }, "Penalità: 2 giri (regola 10)"],
    [{ kind: "penalty", racer: marco, turns: 2, rule: "11" }, "Penalità: 2 giri (regola 11)"],
    [{ kind: "penalty", racer: marco, turns: 2, rule: "12" }, "Penalità: 2 giri (regola 12)"],
    [{ kind: "penalty", racer: marco, turns: 2, rule: "13" }, "Penalità: 2 giri (regola 13)"],
    [{ kind: "penalty", racer: player, turns: 1, rule: "31" }, "Penalità: un giro (boa toccata, regola 31)"],
  ],
  "penalty-done": [[{ kind: "penalty-done", racer: player }, "Penalità scontata"]],
  contact: [
    // The boat at fault is told which rule it broke and why.
    [{ kind: "contact", racer: marco, other: player, atFault: marco, rule: "13", reason: "tacking" },
      "Contatto con Tu/Giulia: regola 13, stava virando"],
    [{ kind: "contact", racer: player, other: marco, atFault: player, rule: "10", reason: "portStarboard" },
      "Contatto con Marco/Tommaso: regola 10, mure a sinistra contro mure a dritta"],
    [{ kind: "contact", racer: player, other: marco, atFault: player, rule: "12", reason: "clearAstern" },
      "Contatto con Marco/Tommaso: regola 12, libera dietro"],
    [{ kind: "contact", racer: player, other: marco, atFault: player, rule: "11", reason: "windward" },
      "Contatto con Marco/Tommaso: regola 11, sopravvento in ingaggio"],
    // The boat with right of way is told who touched it and that they take the penalty.
    [{ kind: "contact", racer: player, other: marco, atFault: marco, rule: "10", reason: "portStarboard" },
      "Marco/Tommaso ti ha toccato (regola 10): penalità a Marco/Tommaso"],
    [{ kind: "contact", racer: marco, other: player, atFault: player, rule: "11", reason: "windward" },
      "Tu/Giulia ti ha toccato (regola 11): penalità a Tu/Giulia"],
  ],
};

describe("race event text", () => {
  for (const [kind, cases] of Object.entries(CASES)) {
    it(`${kind} events read as before`, () => {
      for (const [event, text] of cases) expect(eventText(event)).toBe(text);
    });
  }
});

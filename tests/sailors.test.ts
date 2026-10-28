/**
 * The Sailors module: the Rival roster, the opponents' Crews, the extra Helm and Crew Chemistry.
 * Values are pinned as the game shows them today (menu meters, HUD), so moving or reshaping the data cannot
 * change them unnoticed.
 */
import { describe, expect, it } from "vitest";
import { CREWS, crewChemistry, EXTRA_HELM, opponentCrew, opponentHelms, RIVALS, rivalById, type SailorProfile } from "../src/sailors/Sailors";

const names = (sailors: readonly SailorProfile[]) => sailors.map(s => s.name);

describe("Crew Chemistry", () => {
  it("rates each Rival as a Partner as the menu shows today", () => {
    expect(RIVALS.map(r => [r.name, crewChemistry(r)])).toEqual([["Luca", 72], ["Giulia", 88], ["Marco", 65]]);
  });

  it("rates the opponents' Crews with their Helms", () => {
    expect(CREWS.map(c => [c.name, crewChemistry(c)])).toEqual([["Sara", 79], ["Tommaso", 70], ["Pietro", 79]]);
  });

  it("weighs shared history half, technique and discipline a quarter each", () => {
    const p = { id: "x", name: "X", technique: 0.4, tactics: 0, speed: 0, discipline: 0.8 };
    expect(crewChemistry({ ...p, bond: 100 })).toBe(80);
    expect(crewChemistry({ ...p, bond: 0 })).toBe(30);
  });

  it("assumes a shared history of 60 when there is none", () => {
    expect(crewChemistry(EXTRA_HELM)).toBe(71);
    expect(crewChemistry({ id: "x", name: "X", technique: 1, tactics: 0, speed: 0, discipline: 1 })).toBe(80);
  });

  it("stays within 0..100 and is a whole number", () => {
    const lo = { id: "lo", name: "lo", technique: 0, tactics: 0, speed: 0, discipline: 0, bond: 0 };
    const hi = { id: "hi", name: "hi", technique: 1, tactics: 1, speed: 1, discipline: 1, bond: 100 };
    expect(crewChemistry(lo)).toBe(0);
    expect(crewChemistry(hi)).toBe(100);
  });
});

describe("rosters", () => {
  it("lists the Rivals, the opponents' Crews and the extra Helm", () => {
    expect([...RIVALS, ...CREWS, EXTRA_HELM].map(s => s.id)).toEqual(["luca", "giulia", "marco", "sara", "tommaso", "pietro", "elena"]);
    expect(names(RIVALS)).toEqual(["Luca", "Giulia", "Marco"]);
    expect(names(CREWS)).toEqual(["Sara", "Tommaso", "Pietro"]);
    expect(EXTRA_HELM.name).toBe("Elena");
  });

  it("finds a Rival by id", () => {
    expect(rivalById("marco")).toBe(RIVALS[2]);
    expect(rivalById("nobody")).toBe(undefined);
  });

  it("replaces the player's Partner among the opponent Helms with the extra Helm", () => {
    expect(names(opponentHelms(RIVALS, RIVALS[1]))).toEqual(["Luca", "Marco", "Elena"]);
    expect(names(opponentHelms(RIVALS, RIVALS[0]))).toEqual(["Giulia", "Marco", "Elena"]);
    expect(names(opponentHelms(RIVALS, { ...RIVALS[2] }))).toEqual(["Luca", "Giulia", "Elena"]);
  });

  it("gives each opponent boat a Crew in turn", () => {
    expect([0, 1, 2, 3].map(i => opponentCrew(i).name)).toEqual(["Sara", "Tommaso", "Pietro", "Sara"]);
  });
});

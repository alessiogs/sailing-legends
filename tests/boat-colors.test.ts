/**
 * One table of boat colours, used by the 3D boats and the HUD. The values are the ones the boat views and the HUD
 * defined separately before, so every boat and every dot looks as it did.
 */
import { describe, expect, it } from "vitest";
import { CREW, FULL_BOAT, HELM } from "../src/race/PlayerChoice";
import { makeFleet, type FleetOptions } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";
import { RIVALS } from "../src/sailors/Sailors";
import { boatAccent, boatColors, boatDot } from "../src/ui/boatColors";

const ids = (opts: FleetOptions) => new RaceSession({ fleet: makeFleet(opts) }).race.racers.map(r => r.id);

describe("boat colours", () => {
  it("has its own colours for every boat of every session setup", () => {
    const setups: FleetOptions[] = [
      { boatClass: OPTIMIST },
      { boatClass: I420, choice: HELM },
      { boatClass: I420, choice: CREW },
      { boatClass: I420, choice: FULL_BOAT },
      { boatClass: I420, withPlayer: false },
    ];
    for (const opts of setups) {
      for (const id of ids(opts)) expect(boatDot(id), id).not.toBe("#ccc");
    }
  });

  it("has its own, different colours for the 12 boats of the biggest Career fleet", () => {
    const seats = Array.from({ length: 11 }, () => ({ helm: RIVALS[0], crew: null }));
    const boats = new RaceSession({ fleet: makeFleet({ opponents: seats }) }).race.racers.map(r => r.id);
    expect(boats.length).toBe(12);
    expect(new Set(boats.map(boatDot)).size).toBe(12);
    expect(boats.every(id => boatDot(id) !== "#ccc")).toBe(true);
  });

  it("gives the 3D boats their colours as before", () => {
    expect(boatColors("player")).toMatchObject({
      hull: [0.95, 0.96, 0.95], sail: [0.98, 0.98, 0.96], jacket: [0.95, 0.35, 0.12], stripe: [0.85, 0.12, 0.12],
    });
    expect(boatColors("ai0")).toMatchObject({
      hull: [0.2, 0.45, 0.85], sail: [0.93, 0.95, 0.98], jacket: [0.2, 0.3, 0.8], stripe: [0.95, 0.95, 0.95],
    });
    expect(boatColors("ai1")).toMatchObject({
      hull: [0.98, 0.83, 0.25], sail: [0.98, 0.96, 0.86], jacket: [0.95, 0.75, 0.1], stripe: [0.15, 0.15, 0.2],
    });
    expect(boatColors("ai2")).toMatchObject({
      hull: [0.86, 0.22, 0.18], sail: [0.98, 0.93, 0.92], jacket: [0.8, 0.12, 0.12], stripe: [0.95, 0.95, 0.95],
    });
  });

  it("gives the HUD dots their colours as before", () => {
    expect(["player", "ai0", "ai1", "ai2"].map(boatDot)).toEqual(["#ffffff", "#4aa3ff", "#ffd23f", "#ff5a4e"]);
  });

  it("gives the HUD the player's jacket as its accent colour", () => {
    expect(boatAccent("player")).toBe("#f2591f");
    expect(boatAccent("ai0")).toBe("#334dcc");
  });

  it("draws a boat missing from the table like ai0, with a grey dot", () => {
    expect(boatColors("ai11")).toBe(boatColors("ai0"));
    expect(boatDot("ai11")).toBe("#ccc");
  });
});

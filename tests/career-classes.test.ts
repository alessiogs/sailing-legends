/**
 * Career class moves: the class offer by age, the ILCA rig and Pair weight hints, Chemistry kept across classes, Rivals
 * choosing classes by age and weight, and fleets filled to size. Pure; expected values written out by hand.
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import type { CareerState } from "../src/career/CareerSave";
import {
  ageFits,
  classOffers,
  sailorPath,
  samePath,
} from "../src/career/Classes";
import { partnerOffers, startNextSeason } from "../src/career/SeasonClose";
import { pairWeightHint, rigWeightHint } from "../src/career/Weight";
import { HELM } from "../src/race/PlayerChoice";
import { bodyWeightKg, buildFactorOf } from "../src/sailors/BodyWeight";

/** A Career in the Season where the player is `age`, in `classId`, with the Season over. */
function inSeason(
  age: number,
  classId: CareerState["classId"] = "optimist",
  rig: CareerState["rig"] = null,
): CareerState {
  const entry = (id: string, place: number) => ({
    id,
    status: "finished" as const,
    place,
  });
  const race = [entry("player", 1), entry("luca", 2), entry("giulia", 3)];
  return {
    ...startCareer({ seed: 5, startingAge: 10 }),
    season: age - 9,
    classId,
    rig,
    regattaIndex: 0,
    results: [[race]],
  };
}
const offered = (s: CareerState) =>
  classOffers(s).map((o) => `${o.path.classId}${o.path.rig ?? ""}`);

describe("the class offer by age", () => {
  it("offers every class but the 49er to a 12-year-old", () => {
    // sailed at 11, next Season at 12
    expect(offered(inSeason(11))).toEqual([
      "optimist",
      "420",
      "ilca4",
      "ilca6",
      "ilca7",
      "29er",
    ]);
  });
  it("drops the Optimist after its Age limit (15) unless the player is in it, and offers the 49er from 18", () => {
    expect(offered(inSeason(16, "420"))).toEqual([
      "420",
      "ilca4",
      "ilca6",
      "ilca7",
      "29er",
    ]);
    expect(offered(inSeason(16))).toContain("optimist");
    expect(offered(inSeason(17, "29er"))).toContain("49er");
    expect(offered(inSeason(16, "29er"))).not.toContain("49er");
  });
  it("lets the player go sideways and back: 420 to the Optimist and to a skiff and back", () => {
    const s = inSeason(11, "420");
    s.partnerId = "luca";
    s.chemistry = 50;
    expect(() => startNextSeason(s, { classId: "optimist" })).not.toThrow();
    expect(() =>
      startNextSeason(s, {
        classId: "29er",
        partnerId: "luca",
        choice: HELM,
      }),
    ).not.toThrow();
  });
  it("refuses a class the age does not allow, and a rig the ILCA does not have", () => {
    expect(() =>
      startNextSeason(inSeason(11), {
        classId: "49er",
        partnerId: "luca",
        choice: HELM,
      }),
    ).toThrow();
    expect(() =>
      startNextSeason(inSeason(16, "420"), { classId: "optimist" }),
    ).toThrow();
    expect(() =>
      startNextSeason(inSeason(11), { classId: "ilca", rig: 5 as 4 }),
    ).toThrow();
  });
  it("moves to an ILCA rig with no Partner", () => {
    const next = startNextSeason(inSeason(11), { classId: "ilca", rig: 7 });
    expect([next.classId, next.rig, next.partnerId, next.chemistry]).toEqual([
      "ilca",
      7,
      null,
      null,
    ]);
  });
});

describe("weight hints", () => {
  it("rates a sailor against each ILCA rig's range (4: 50-65, 6: 60-78, 7: 73-90 kg)", () => {
    expect(rigWeightHint(49, 4)).toBe("light");
    expect(rigWeightHint(55, 4)).toBe("ideal");
    expect(rigWeightHint(66, 4)).toBe("heavy");
    expect(rigWeightHint(68, 6)).toBe("ideal");
    expect(rigWeightHint(72, 7)).toBe("light");
    expect(rigWeightHint(85, 7)).toBe("ideal");
  });
  it("offers the player each rig with its hint for their weight next Season", () => {
    // a heavy player: 11 -> 12 is 47.7 kg * 1.15 = 54.9 kg: ideal in the 4, light in the 6 and 7
    const s = { ...inSeason(11), build: "heavy" as const };
    const hints = classOffers(s)
      .filter((o) => o.path.rig !== null)
      .map((o) => o.hint);
    expect(hints).toEqual(["ideal", "light", "light"]);
  });
  it("rates a Pair against its class: 420 110-130, 29er 120-130, 49er 150-170 kg", () => {
    expect(pairWeightHint(115)).toBe("ideal");
    expect(pairWeightHint(115, "29er")).toBe("light");
    expect(pairWeightHint(125, "29er")).toBe("ideal");
    expect(pairWeightHint(125, "49er")).toBe("light");
    expect(pairWeightHint(160, "49er")).toBe("ideal");
    expect(pairWeightHint(175, "49er")).toBe("heavy");
  });
  it("gives the Partner offers the hint of the class asked", () => {
    const s = inSeason(17, "420");
    for (const o of partnerOffers(s, "49er"))
      expect(o.hint).toBe(pairWeightHint(o.pairKg, "49er"));
  });
});

describe("Crew Chemistry across classes", () => {
  it("is kept when the same Partner moves from the 420 to a skiff", () => {
    const s = { ...inSeason(13, "420"), partnerId: "luca", chemistry: 63 };
    for (const classId of ["29er", "49er"] as const) {
      const age = classId === "49er" ? 17 : 13;
      const from = {
        ...inSeason(age, "420"),
        partnerId: "luca",
        chemistry: 63,
      };
      const next = startNextSeason(from, {
        classId,
        partnerId: "luca",
        choice: HELM,
      });
      expect(next.chemistry).toBe(63);
      expect(next.classId).toBe(classId);
    }
    const other = startNextSeason(s, {
      classId: "29er",
      partnerId: "giulia",
      choice: HELM,
    });
    expect(other.chemistry).not.toBe(63);
  });
});

describe("Rivals choose a class by age and weight", () => {
  const ids = ["luca", "giulia", "marco"];
  const path = (id: string, age: number, season = 3) =>
    sailorPath(7, season, id, age - season + 1);
  it("keeps children in the Optimist", () => {
    for (const id of ids) expect(path(id, 9).classId).toBe("optimist");
  });
  it("sends heavy sailors to the ILCA 7 or the 49er, light ones to the ILCA 4 or the 420", () => {
    const ids400 = Array.from({ length: 400 }, (_, i) => `s${i}`);
    const heavy = ids400.filter(
      (id) => bodyWeightKg(19, buildFactorOf(id)) >= 75,
    );
    const light = ids400.filter(
      (id) => bodyWeightKg(17, buildFactorOf(id)) < 56,
    );
    expect(heavy.length).toBeGreaterThan(5);
    for (const id of heavy) {
      const p = path(id, 19);
      expect(
        p.classId === "49er" || (p.classId === "ilca" && p.rig === 7),
      ).toBe(true);
    }
    expect(light.length).toBeGreaterThan(5);
    for (const id of light) {
      const p = path(id, 17);
      expect(p.classId === "420" || (p.classId === "ilca" && p.rig === 4)).toBe(
        true,
      );
    }
  });
  it("is the same every time", () => {
    expect(path("luca", 15)).toEqual(path("luca", 15));
  });
});

describe("fleets in the new classes", () => {
  it("are filled to size in every class, a Pair on every opponent boat of a two-person class", () => {
    for (const [classId, rig] of [
      ["ilca", 4],
      ["ilca", 7],
      ["29er", null],
      ["49er", null],
    ] as const) {
      const base = inSeason(18, classId, rig);
      for (const i of [0, 6]) {
        const state = {
          ...base,
          regattaIndex: i,
          results: [...Array(i)].map(() => []).concat([[]]),
        };
        const setup = nextRaceSetup(state)!;
        expect(setup.fleet.opponents.length).toBe(i === 0 ? 5 : 11);
        const ids = [
          setup.fleet.player?.id,
          ...setup.fleet.opponents.flatMap((b) => [b.helm.id, b.crew?.id]),
        ].filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length);
        if (classId === "ilca") expect(setup.fleet.boatClass.rig).toBe(rig);
      }
    }
  });
});

describe("Rivals keep their class from Season to Season", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `r${i}`);
  it("never return to the Optimist once they have left it, and follow the player's age windows", () => {
    for (const id of ids) {
      let left = false;
      for (let season = 1; season <= 12; season++) {
        const p = sailorPath(3, season, id, 10);
        const age = 10 + season - 1;
        if (left) expect(p.classId).not.toBe("optimist");
        if (p.classId !== "optimist") left = true;
        if (age > 10) expect(ageFits(p.classId, age)).toBe(true);
      }
    }
  });
  it("change class rarely", () => {
    let moves = 0;
    let seasons = 0;
    for (const id of ids)
      for (let season = 2; season <= 12; season++) {
        seasons++;
        if (
          !samePath(
            sailorPath(3, season, id, 10),
            sailorPath(3, season - 1, id, 10),
          )
        )
          moves++;
      }
    // Growing sailors are forced out of a class now and then; a random redraw would move about two Seasons in three.
    expect(moves / seasons).toBeLessThan(0.4);
  });
});

/**
 * The Season calendar as data: seven Regattas (home club, four Zonale stages, national, international), Races and Discard
 * per Regatta. Expected values are written out by hand from the spec (#130).
 */
import { describe, expect, it } from "vitest";
import { seasonCalendar, venueName } from "../src/career/Calendar";

describe("season calendar", () => {
  for (const classId of ["optimist", "420"] as const) {
    describe(classId, () => {
      const calendar = seasonCalendar(classId);

      it("is the club, four Zonale stages, then the national and international Regattas", () => {
        expect(calendar.map(r => r.level)).toEqual(["club", "regional", "regional", "regional", "regional", "national", "international"]);
        expect(calendar.map(r => r.stage?.number ?? null)).toEqual([null, 1, 2, 3, 4, null, null]);
      });
      it("sails the class of the Season, three Races per Regatta", () => {
        expect(calendar.every(r => r.classId === classId)).toBe(true);
        expect(calendar.map(r => r.races)).toEqual([3, 2, 2, 2, 2, 3, 3]);
      });
      it("applies the Discard in the Regattas of three Races", () => {
        expect(calendar.map(r => r.discard)).toEqual([true, false, false, false, false, true, true]);
      });
      it("is open to everyone, for now", () => {
        expect(calendar.map(r => r.entry)).toEqual(Array(7).fill("open"));
      });
      it("names each Regatta's town (and club, where known) and gives each a distinct id", () => {
        expect(calendar.map(r => venueName(r))).toEqual([
          "Circolo del Mare Fertilia, Alghero", "LNI Olbia, Olbia", "Circolo Nautico La Caletta, La Caletta",
          "Yacht Club Porto Rotondo, Porto Rotondo", "Yacht Club Cagliari, Cagliari", "Follonica", "Fraglia Vela Riva, Riva del Garda",
        ]);
        expect(new Set(calendar.map(r => r.id)).size).toBe(7);
      });
    });
  }
});

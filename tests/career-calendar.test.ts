/**
 * The Season calendar as data: four Regattas of rising level, three Races each, the Discard from the third Regatta.
 * Expected values are written out by hand from the spec (#84, #87).
 */
import { describe, expect, it } from "vitest";
import { seasonCalendar } from "../src/career/Calendar";

describe("season calendar", () => {
  for (const classId of ["optimist", "420"] as const) {
    describe(classId, () => {
      const calendar = seasonCalendar(classId);

      it("is four Regattas of rising level: club, regional, national, international", () => {
        expect(calendar.map(r => r.level)).toEqual(["club", "regional", "national", "international"]);
      });
      it("sails the class of the Season, three Races per Regatta", () => {
        expect(calendar.map(r => r.classId)).toEqual([classId, classId, classId, classId]);
        expect(calendar.map(r => r.races)).toEqual([3, 3, 3, 3]);
      });
      it("applies the Discard from the third Regatta", () => {
        expect(calendar.map(r => r.discard)).toEqual([false, false, true, true]);
      });
      it("is open to everyone, for now", () => {
        expect(calendar.map(r => r.entry)).toEqual(["open", "open", "open", "open"]);
      });
      it("names each Regatta's venue and gives each a distinct id", () => {
        for (const r of calendar) expect(r.venue.length > 0).toBe(true);
        expect(new Set(calendar.map(r => r.id)).size).toBe(4);
      });
    });
  }
});

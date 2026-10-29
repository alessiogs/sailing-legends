/**
 * Low-point scoring of a Regatta and a Season, through the public functions of career/Scoring.ts.
 * Rankings are data (ids and numbers); the expected values are worked by hand.
 */
import { describe, expect, it } from "vitest";
import { racePoints, scoreRegatta, scoreSeason, type RaceEntry } from "../src/career/Scoring";

/** A Race where the given ids finish in order. */
const finish = (...ids: string[]): RaceEntry[] => ids.map((id, i) => ({ id, status: "finished", place: i + 1 }));

describe("racePoints", () => {
  it("a finisher scores their place", () => {
    expect(racePoints({ id: "a", status: "finished", place: 1 }, 6)).toBe(1);
    expect(racePoints({ id: "a", status: "finished", place: 4 }, 6)).toBe(4);
  });
  it("OCS, DSQ and not finished score the fleet size plus one", () => {
    expect(racePoints({ id: "a", status: "ocs" }, 6)).toBe(7);
    expect(racePoints({ id: "a", status: "dsq" }, 6)).toBe(7);
    expect(racePoints({ id: "a", status: "dnf" }, 10)).toBe(11);
  });
});

describe("scoreRegatta", () => {
  it("sums the Points and ranks the lowest total first", () => {
    const s = scoreRegatta([finish("a", "b", "c"), finish("b", "a", "c"), finish("a", "c", "b")], false);
    expect(s.map(x => x.id)).toEqual(["a", "b", "c"]);
    expect(s.map(x => x.points)).toEqual([4, 6, 8]);
    expect(s.map(x => x.place)).toEqual([1, 2, 3]);
    expect(s[0].scores).toEqual([1, 2, 1]);
  });
  it("scores OCS, DSQ and not finished as the fleet size plus one", () => {
    const r: RaceEntry[] = [
      { id: "a", status: "finished", place: 1 }, { id: "b", status: "ocs" },
      { id: "c", status: "dsq" }, { id: "d", status: "dnf" },
    ];
    expect(scoreRegatta([r], false).map(x => x.points)).toEqual([1, 5, 5, 5]);
  });
  it("leaves out each sailor's worst Race when the Discard applies", () => {
    const races = [finish("a", "b", "c"), finish("b", "c", "a"), finish("c", "a", "b")];
    const s = scoreRegatta(races, true);
    // a: 1,3,2 -> 3 counted; b: 2,1,3 -> 3; c: 3,2,1 -> 3 (all tied, see tie-break tests)
    expect(s.map(x => x.points)).toEqual([3, 3, 3]);
    expect(s.find(x => x.id === "a")!.discarded).toBe(1);
    expect(scoreRegatta(races, false).map(x => x.points)).toEqual([6, 6, 6]);
    expect(scoreRegatta(races, false).every(x => x.discarded === null)).toBe(true);
  });
  it("discards the first of equal worst scores", () => {
    const s = scoreRegatta([finish("a", "b"), finish("b", "a"), finish("a", "b")], true);
    expect(s.find(x => x.id === "b")!.discarded).toBe(0);
  });
  it("a disqualification can be the discarded Race", () => {
    const dsq: RaceEntry[] = [{ id: "a", status: "dsq" }, { id: "b", status: "finished", place: 1 }];
    const s = scoreRegatta([dsq, finish("a", "b"), finish("a", "b")], true);
    expect(s.find(x => x.id === "a")!.points).toBe(2);
    expect(s[0].id).toBe("a");
  });
});

describe("Regatta tie-breaks", () => {
  it("the sailor with more firsts wins a tie on Points", () => {
    // a: 1,4 = 5; b: 2,3 = 5 -> a has a first
    const races = [finish("a", "b", "c", "d"), finish("c", "d", "b", "a")];
    const s = scoreRegatta(races, false);
    const a = s.find(x => x.id === "a")!, b = s.find(x => x.id === "b")!;
    expect(a.points).toBe(b.points);
    expect(a.place < b.place).toBe(true);
  });
  it("then more seconds, and so on down the places", () => {
    // a: 2,3,6 = 11 and b: 3,4,4 = 11, no firsts; a has a second. b's better last Race does not count yet.
    const races = [
      finish("x", "a", "b", "y", "z", "w"),
      finish("x", "y", "a", "b", "z", "w"),
      finish("x", "y", "z", "b", "w", "a"),
    ];
    const s = scoreRegatta(races, false);
    const a = s.find(x => x.id === "a")!, b = s.find(x => x.id === "b")!;
    expect([a.points, b.points]).toEqual([11, 11]);
    expect(a.place < b.place).toBe(true);
  });
  it("then the better place in the last Race", () => {
    // a: 1,3,2 ; b: 2,1,3 ; c: 3,2,1 -> identical sorted scores, so the last Race decides: c 1, a 2, b 3
    const races = [finish("a", "b", "c"), finish("b", "c", "a"), finish("c", "a", "b")];
    expect(scoreRegatta(races, false).map(x => x.id)).toEqual(["c", "a", "b"]);
  });
  it("tie-breaks look at the counted scores, so a tie after the Discard is resolved", () => {
    // a: 1,5,2 and b: 2,1,5 both drop their 5 and keep {1,2}; the last Race (a 2, b 5) then favours a
    const races = [
      finish("a", "b", "c", "d", "e"),
      finish("b", "c", "d", "e", "a"),
      finish("c", "a", "d", "e", "b"),
    ];
    const s = scoreRegatta(races, true);
    const a = s.find(x => x.id === "a")!, b = s.find(x => x.id === "b")!;
    expect([a.points, b.points]).toEqual([3, 3]);
    expect(a.place < b.place).toBe(true);
  });
  it("a complete tie keeps the order of the first Race and gives distinct places", () => {
    const s = scoreRegatta([[
      { id: "a", status: "dnf" }, { id: "b", status: "dnf" },
    ]], false);
    expect(s.map(x => x.id)).toEqual(["a", "b"]);
    expect(s.map(x => x.place)).toEqual([1, 2]);
  });
});

describe("scoreSeason", () => {
  it("adds the Regatta places, lowest first", () => {
    const r1 = scoreRegatta([finish("a", "b", "c")], false);
    const r2 = scoreRegatta([finish("b", "a", "c")], false);
    const r3 = scoreRegatta([finish("a", "c", "b")], false);
    const s = scoreSeason([r1, r2, r3]);
    expect(s.map(x => x.id)).toEqual(["a", "b", "c"]);
    expect(s.map(x => x.points)).toEqual([4, 6, 8]);
    expect(s.map(x => x.place)).toEqual([1, 2, 3]);
    expect(s[0].regattaPlaces).toEqual([1, 2, 1]);
  });
  it("breaks ties by most Regatta wins, then the last Regatta", () => {
    const wins = scoreSeason([
      scoreRegatta([finish("a", "b", "c")], false),
      scoreRegatta([finish("c", "a", "b")], false),
    ]);
    const tie = scoreSeason([
      scoreRegatta([finish("a", "b", "c")], false),
      scoreRegatta([finish("c", "b", "a")], false),
    ]);
    expect(wins.map(x => x.points)).toEqual([3, 4, 5]);
    expect(tie.map(x => x.points)).toEqual([4, 4, 4]);
    // a 1,3 / b 2,2 / c 3,1 all total 4; a and c each won one Regatta, b none; c won the last one
    expect(tie.map(x => x.id)).toEqual(["c", "a", "b"]);
  });
  it("a sailor missing from a Regatta scores that fleet size plus one", () => {
    const s = scoreSeason([
      scoreRegatta([finish("a", "b")], false),
      scoreRegatta([finish("a", "b", "c")], false),
    ]);
    expect(s.find(x => x.id === "c")!.regattaPlaces).toEqual([3, 3]);
  });
});

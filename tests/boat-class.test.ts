/**
 * Boat classes are keyed by a closed set of class ids, so a misspelt id is a compile error.
 */
import { describe, expect, it } from "vitest";
import { CLASSES, I420, OPTIMIST, isClassId, type ClassId } from "../src/sailing/BoatClass";

describe("boat class ids", () => {
  it("cannot name a class that does not exist", () => {
    // @ts-expect-error "optimst" is not a class id.
    const misspelt: ClassId = "optimst";
    expect(isClassId(misspelt)).toBe(false);
  });

  it("keys every class by its own id", () => {
    expect(CLASSES).toEqual({ optimist: OPTIMIST, "420": I420 });
    for (const [id, cls] of Object.entries(CLASSES)) expect(cls.id).toBe(id);
  });

  it("recognises the ids the menu buttons carry, and nothing else", () => {
    expect(isClassId("optimist")).toBe(true);
    expect(isClassId("420")).toBe(true);
    expect(isClassId(undefined)).toBe(false);
    expect(isClassId("toString")).toBe(false);
    expect(isClassId("")).toBe(false);
  });
});

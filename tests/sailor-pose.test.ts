import { describe, expect, it } from "vitest";
import { figureHeight, sailNumber, sailorLooks } from "../src/world/pose/looks";
import { sailorPose, type Pose, type PoseInput } from "../src/world/pose/sailorPose";

const base: PoseInput = {
  classId: "420", role: "crew", crewSide: -1, crewOut: 0.5, boomSide: 1, spiHoist: 0,
  heelDeg: 5, sideForce: 100, tiller: 0, height: 1.6,
};

describe("sailor pose", () => {
  it("a crossing ends on the new side within 1.2 s", () => {
    let pose: Pose | null = sailorPose(base, null, 1 / 60);
    expect(pose.side).toBe(-1);
    let t = 0, sawCrossing = false;
    for (; t < 1.2; t += 1 / 60) {
      pose = sailorPose({ ...base, crewSide: 1 }, pose, 1 / 60);
      if (pose.crossing > 0) sawCrossing = true;
      if (pose.crossing === 0 && pose.side === 1) break;
    }
    expect(sawCrossing).toBe(true);
    expect(pose.crossing).toBe(0);
    expect(pose.side).toBe(1);
    expect(pose.position.x).toBeGreaterThan(0);
    expect(t).toBeLessThan(1.2);
  });

  it("size grows with age; looks and sail number are deterministic", () => {
    expect(figureHeight(8)).toBeCloseTo(1.3, 2);
    expect(figureHeight(16)).toBeCloseTo(1.75, 2);
    expect(figureHeight(30)).toBe(figureHeight(16));
    expect(figureHeight(12)).toBeGreaterThan(figureHeight(10));
    expect(figureHeight()).toBe(figureHeight(14));
    expect(sailorLooks("rival-marco")).toEqual(sailorLooks("rival-marco"));
    expect(sailNumber("rival-marco", "420")).toBe(sailNumber("rival-marco", "420"));
    expect(sailNumber("rival-marco", "optimist")).not.toBe(sailNumber("rival-marco", "420"));
    expect(sailNumber("rival-marco", "420")).toMatch(/^ITA \d+$/);
  });
});

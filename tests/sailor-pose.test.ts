import { describe, expect, it } from "vitest";
import { figureHeight, sailNumber, sailorLooks } from "../src/world/pose/looks";
import {
  sailorPose,
  type Pose,
  type PoseInput,
} from "../src/world/pose/sailorPose";

const base: PoseInput = {
  classId: "420",
  role: "crew",
  crewSide: -1,
  crewOut: 0.5,
  boomSide: 1,
  spiHoist: 0,
  heelDeg: 5,
  sideForce: 100,
  tiller: 0,
  height: 1.6,
};

describe("sailor pose", () => {
  it("a crossing ends on the new side within 1.2 s", () => {
    let pose: Pose | null = sailorPose(base, null, 1 / 60);
    expect(pose.side).toBe(-1);
    let t = 0,
      sawCrossing = false;
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
    expect(sailNumber("rival-marco", "420")).toBe(
      sailNumber("rival-marco", "420"),
    );
    expect(sailNumber("rival-marco", "optimist")).not.toBe(
      sailNumber("rival-marco", "420"),
    );
    expect(sailNumber("rival-marco", "420")).toMatch(/^ITA \d+$/);
  });
});

describe("skiff trapeze poses", () => {
  const settle = (input: PoseInput) => {
    let pose: Pose | null = null;
    for (let k = 0; k < 10; k++) pose = sailorPose(input, pose, 1 / 60);
    return pose!;
  };

  it("hangs the 49er's Helm and Crew from the trapeze, feet on the racks", () => {
    const helm = settle({
      ...base,
      classId: "49er",
      role: "helm",
      helmOut: 1,
      crewOut: 1,
      crewSide: 1,
    });
    const crew = settle({
      ...base,
      classId: "49er",
      role: "crew",
      crewOut: 1,
      crewSide: 1,
    });
    for (const p of [helm, crew]) {
      expect(p.onWire).toBe(true);
      expect(p.targets.handle).toBeDefined();
      expect(p.harness.x).toBeGreaterThan(1.4); // out beyond the racks' edge
      expect(p.joints.footL.x).toBeGreaterThan(1.0);
    }
    expect(helm.joints.pelvis.z).toBeLessThan(crew.joints.pelvis.z); // the Helm aft of the Crew
    // The Helm still holds the tiller extension and the mainsheet.
    expect(helm.extension).toBeDefined();
    expect(helm.targets.tiller).toBeDefined();
  });

  it("keeps the 49er's Helm in the boat until the weight goes past hiking", () => {
    const hiking = settle({
      ...base,
      classId: "49er",
      role: "helm",
      helmOut: 0.5,
    });
    expect(hiking.onWire).toBe(false);
    const out = settle({
      ...base,
      classId: "49er",
      role: "helm",
      helmOut: 0.9,
    });
    expect(out.onWire).toBe(true);
  });

  it("hangs only the 29er's Crew, the Helm hikes", () => {
    const crew = settle({ ...base, classId: "29er", role: "crew", crewOut: 1 });
    const helm = settle({
      ...base,
      classId: "29er",
      role: "helm",
      helmOut: 1,
      crewOut: 1,
    });
    expect(crew.onWire).toBe(true);
    expect(helm.onWire).toBe(false);
  });
});

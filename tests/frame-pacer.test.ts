import { describe, expect, it } from "vitest";
import { FramePacer } from "../src/core/FramePacer";

describe("FramePacer", () => {
  it("passes every frame when uncapped", () => {
    const p = new FramePacer();
    expect(p.tick(0.004, 0)).toBeCloseTo(0.004);
  });

  it("caps 120 Hz frames to 60 fps and keeps the dt", () => {
    const p = new FramePacer();
    expect(p.tick(1 / 120, 60)).toBeNull();
    expect(p.tick(1 / 120, 60)).toBeCloseTo(1 / 60);
  });

  it("accepts slightly early 60 Hz frames", () => {
    expect(new FramePacer().tick(0.0155, 60)).toBeCloseTo(0.0155);
  });

  it("renders at 10 fps when idle and accumulates the time", () => {
    const p = new FramePacer();
    let total = 0;
    let drawn = 0;
    for (let i = 0; i < 60; i++) {
      const dt = p.tick(1 / 60, 10);
      if (dt !== null) {
        total += dt;
        drawn++;
      }
    }
    expect(drawn).toBe(10);
    expect(total).toBeCloseTo(1, 5);
  });
});

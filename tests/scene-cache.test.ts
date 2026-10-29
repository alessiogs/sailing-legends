/**
 * The boats' material cache: one material per look and scene, made again for a new scene so a boat never gets a
 * material from a disposed scene. Plain objects stand in for Babylon scenes and materials.
 */
import { describe, expect, it } from "vitest";
import { SceneCache } from "../src/world/sceneCache";

describe("scene cache", () => {
  it("makes a value once per key and scene", () => {
    const cache = new SceneCache<object, { n: number }>();
    const scene = {};
    let made = 0;
    const make = () => ({ n: ++made });
    const first = cache.get(scene, "hull-#ffffff", make);
    expect(cache.get(scene, "hull-#ffffff", make)).toBe(first);
    expect(made).toBe(1);
    expect(cache.get(scene, "sail-#ffffff", make)).not.toBe(first);
    expect(made).toBe(2);
  });

  it("makes the value again for a recreated scene", () => {
    const cache = new SceneCache<object, { n: number }>();
    let made = 0;
    const make = () => ({ n: ++made });
    const old = cache.get({}, "hull-#ffffff", make);
    const fresh = cache.get({}, "hull-#ffffff", make);
    expect(fresh).not.toBe(old);
    expect(made).toBe(2);
  });
});

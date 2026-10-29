/**
 * The drag source of `Input`: the UI layer holds the tiller / weight gauge and the sheet at a position along a bar
 * (0..1) and lets go with null. Keys and gamepad keep working as before; Input knows nothing of the HUD.
 */
import { describe, expect, it } from "vitest";
import { Input } from "../src/core/Input";

/** An Input with no window: nothing listens for keys. */
function input(role: "helm" | "crew" = "helm") {
  const i = new Input({ addEventListener() {} });
  i.role = role;
  return i;
}

describe("Input drag source", () => {
  it("drags the Helm's tiller along the bar: left end port, centre straight, right end starboard", () => {
    const i = input();
    i.dragGauge(0); i.update(1 / 60);
    expect(i.tiller).toBe(-1);
    i.dragGauge(0.5); i.update(1 / 60);
    expect(i.tiller).toBe(0);
    i.dragGauge(1); i.update(1 / 60);
    expect(i.tiller).toBe(1);
    expect(i.rudder).toBe(-1);
  });

  it("clamps a position outside the bar", () => {
    const i = input();
    i.dragGauge(3); i.update(1 / 60);
    expect(i.tiller).toBe(1);
    i.dragGauge(-2); i.update(1 / 60);
    expect(i.tiller).toBe(-1);
  });

  it("follows the Commands setting: with boat steering the right end turns the bow to starboard", () => {
    const i = input();
    i.settings = { ...i.settings, steering: "boat" };
    i.dragGauge(1); i.update(1 / 60);
    expect(i.tiller).toBe(-1);
    expect(i.rudder).toBe(1);
  });

  it("lets go: the tiller centres as after the keys with auto-centre, and stays put without it", () => {
    const a = input();
    a.dragGauge(1); a.update(1 / 60);
    a.dragGauge(null);
    for (let n = 0; n < 60; n++) a.update(1 / 60);
    expect(a.tiller).toBe(0);
    const b = input();
    b.settings = { ...b.settings, autoCenter: false };
    b.dragGauge(0.8); b.update(1 / 60);
    b.dragGauge(null);
    for (let n = 0; n < 60; n++) b.update(1 / 60);
    expect(Math.abs(b.tiller - 0.6) < 1e-9).toBe(true);
  });

  it("drags the Crew's weight: in 0, hiking 0.5, trapeze 1", () => {
    const i = input("crew");
    i.dragGauge(1); i.update(1 / 60);
    expect(i.crewOut).toBe(1);
    i.dragGauge(0.5); i.update(1 / 60);
    expect(i.crewOut).toBe(0.5);
    expect(i.tiller).toBe(0);
    i.dragGauge(null); i.update(1 / 60);
    expect(i.crewOut).toBe(0.5);
  });

  it("drags the sheet independently of the gauge, so two fingers work together", () => {
    const i = input();
    i.dragGauge(0.75); i.dragSheet(0.2); i.update(1 / 60);
    expect(i.tiller).toBe(0.5);
    expect(i.sheet).toBe(0.2);
    i.dragGauge(null); i.update(1 / 60);
    expect(i.sheet).toBe(0.2);
    i.dragSheet(null);
    i.update(1 / 60);
    expect(i.sheet).toBe(0.2);
  });

  it("changes nothing when nobody drags", () => {
    const i = input();
    i.update(1 / 60);
    expect(i.tiller).toBe(0);
    expect(i.sheet).toBe(0.55);
    expect(i.crewOut).toBe(0.3);
  });

  it("reset lets go of a drag", () => {
    const i = input();
    i.dragGauge(1); i.reset(); i.update(1 / 60);
    expect(i.tiller).toBe(0);
  });

  it("presses the actions the player taps, once each, in order", () => {
    const i = input();
    i.press("pause"); i.press("spi");
    expect(i.consume()).toEqual(["pause", "spi"]);
    expect(i.consume()).toEqual([]);
  });
});

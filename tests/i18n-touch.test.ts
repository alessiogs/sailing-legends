/** Touch wording: on a touch screen a message that names a key is read from its ".touch" variant. */
import { afterEach, describe, expect, it } from "vitest";
import { lookup, setLanguage, setTouchWording, t } from "../src/i18n";

afterEach(() => { setTouchWording(false); setLanguage("it"); });

describe("touch wording", () => {
  it("reads the keyboard wording by default", () => {
    expect(t("results.hint")).toMatch(/^R per/);
    expect(lookup("hud.hint")).toMatch(/^H:/);
  });

  it("reads the touch variant when there is one, with its parameters", () => {
    setTouchWording(true);
    expect(t("results.hint")).toBe(t("results.hint.touch"));
    expect(lookup("hud.hint")).toBe(t("hud.hint.touch"));
    expect(t("call.switchSide", { name: "Giulia" })).toBe(t("call.switchSide.touch", { name: "Giulia" }));
    setLanguage("en");
    expect(t("pause.restartHint")).toBe("Tap Restart to sail the race again");
  });

  it("keeps the same wording for a message without a touch variant", () => {
    setTouchWording(true);
    expect(t("pause.title")).toBe("PAUSA");
  });

  it("names no key in any touch variant", () => {
    setTouchWording(true);
    const text = [t("results.hint"), t("pause.restartHint"), t("hud.hint"), t("hud.slider.in"), t("hud.gauge.out"), t("trim.luffing"), t("trim.stalled"), t("call.spiHoist", { name: "X" })];
    for (const line of text) expect(line).not.toMatch(/\((W|S|A|D|E)\)|premi E|Spazio|\bR per\b/);
  });
});

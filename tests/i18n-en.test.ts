/**
 * The English catalog: same keys as the Italian reference (the type-check also guarantees it), English plural and
 * ordinal forms, and the glossary's terms for the sailors and the Assists.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLanguage, t } from "../src/i18n";
import { english } from "../src/i18n/en";
import { italian } from "../src/i18n/it";

beforeEach(() => setLanguage("en"));
afterEach(() => setLanguage("it"));

describe("English catalog", () => {
  it("has exactly the Italian catalog's keys, as plain strings or functions alike", () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(italian).sort());
    for (const key of Object.keys(italian) as (keyof typeof italian)[]) {
      expect(typeof english[key], key).toBe(typeof italian[key]);
    }
  });

  it("uses no empty message and keeps the message parameters", () => {
    expect(t("call.switchSide", { name: "Giulia" })).toBe("Giulia: “Switch sides!” → press E");
    expect(t("menu.versionChip", { boatClass: "420" })).toBe("PROTOTYPE 0.4 · 420");
    for (const [key, message] of Object.entries(english)) {
      if (typeof message === "string") expect(message.trim() !== "", key).toBe(true);
    }
  });

  it("uses the glossary's terms", () => {
    expect(t("menu.role.helm")).toBe("Helm");
    expect(t("menu.role.crew")).toBe("Crew");
    expect(t("menu.role.fullBoat")).toBe("Full Boat Control");
    expect(t("menu.autoTrim")).toBe("Auto-trim (Assist)");
    expect(t("menu.label.partner")).toBe("YOUR PARTNER · CREW CHEMISTRY");
    expect(t("hud.chem.pair", { name: "Giulia" })).toBe("Pair with Giulia · Chemistry");
    for (const message of Object.values(english)) {
      if (typeof message === "string") expect(message).not.toMatch(/skipper|teammate/i);
    }
  });

  it("picks English plural forms for penalty turns", () => {
    const owed = (turns: number) => t("hud.penalty", { turns, done: 0, total: turns * 360 });
    expect(owed(1)).toBe("Penalty: 1 turn to do (0° / 360°) · always turn the same way");
    expect(owed(2)).toBe("Penalty: 2 turns to do (0° / 720°) · always turn the same way");
    expect(t("event.penalty", { turns: 1, reason: "rule 10" })).toBe("Penalty: one turn (rule 10)");
    expect(t("event.penalty", { turns: 2, reason: "rule 10" })).toBe("Penalty: 2 turns (rule 10)");
  });

  it("words places with English ordinals", () => {
    const places = [1, 2, 3, 4, 11, 12, 13, 21, 22].map(place => t("results.place", { place }));
    expect(places).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
    expect(t("event.finish", { place: 2 })).toBe("FINISH! 2nd place");
    expect(t("hud.position", { position: 3, boats: 6 })).toBe("3rd/6");
  });

  it("reads the page's static messages through lookup in the active language", async () => {
    const { lookup } = await import("../src/i18n");
    expect(lookup("menu.start")).toBe("Start race");
    setLanguage("it");
    expect(lookup("menu.start")).toBe("Inizia prova");
  });
});

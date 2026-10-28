/**
 * The translation module: typed keys with parameters, plurals through the language's plural rules, and catalogs
 * that must all have the same keys. The `@ts-expect-error` lines are checked by `tsc -b` (npm run build).
 */
import { describe, expect, it } from "vitest";
import { t, type Catalog } from "../src/i18n";
import { italian } from "../src/i18n/it";
import { plurals } from "../src/i18n/plural";

describe("translation", () => {
  it("looks up a message by key", () => {
    expect(t("toast.audioOff")).toBe("Audio disattivato");
  });

  it("fills a message's parameters", () => {
    expect(t("call.switchSide", { name: "Giulia" })).toBe("Giulia: «Cambia lato!» → premi E");
  });

  it("picks the plural form from the Italian plural rules", () => {
    const owed = (turns: number) => t("hud.penalty", { turns, done: 0, total: turns * 360 });
    expect(owed(1)).toBe("Penalità: 1 giro da fare (0° / 360°) · gira sempre nello stesso verso");
    expect(owed(2)).toBe("Penalità: 2 giri da fare (0° / 720°) · gira sempre nello stesso verso");
  });

  it("follows each language's own plural rules", () => {
    const forms = { one: "one", other: "other" };
    expect(plurals("it")(0, forms)).toBe("other");
    expect(plurals("fr")(0, forms)).toBe("one");
  });

  it("falls back to the other form when a category has no text", () => {
    expect(plurals("pl")(2, { one: "one", other: "other" })).toBe("other");
  });

  it("words the Partner's line in the HUD panel as before", () => {
    expect(t("hud.partnerLine.helm", { name: "Giulia", spi: "giù" })).toBe("Giulia al timone e alla randa · spi: giù");
    expect(t("hud.partnerLine.crew", { name: "Giulia", weight: "al trapezio", spi: "su" })).toBe("Giulia: al trapezio · spi su");
    expect(t("hud.partnerLine.crewOnCall", { name: "Giulia", weight: "dentro", spi: "giù" }))
      .toBe("Giulia: dentro · spi giù · Spazio = issa/ammaina");
  });
});

// Type-level checks: a catalog missing a key, or with a key the others lack, does not type-check.
const { "toast.audioOff": _dropped, ...missingOne } = italian;
// @ts-expect-error a catalog missing a key is a compile error
export const incomplete: Catalog = missingOne;
// @ts-expect-error a key that the other catalogs lack is a compile error
export const extra: Catalog = { ...italian, "toast.onlyHere": "Solo qui" };
// @ts-expect-error unknown keys are a compile error
export const unknownKey = () => t("toast.noSuchKey");
// @ts-expect-error a message with parameters needs them
export const missingParams = () => t("call.switchSide");

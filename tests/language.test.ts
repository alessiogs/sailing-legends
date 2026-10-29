/**
 * Which language the game starts in: the saved choice, else the browser's language (English for "en", "en-GB", …),
 * else Italian. `setLanguage` switches the catalog `t` reads.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chooseLanguage, currentLanguage, setLanguage, t } from "../src/i18n";

afterEach(() => setLanguage("it"));

describe("language selection", () => {
  it("prefers the saved choice", () => {
    expect(chooseLanguage("en", "it-IT")).toBe("en");
    expect(chooseLanguage("it", "en-US")).toBe("it");
  });

  it("falls back to the browser's language: English for any English locale", () => {
    expect(chooseLanguage(undefined, "en")).toBe("en");
    expect(chooseLanguage(undefined, "en-GB")).toBe("en");
    expect(chooseLanguage(undefined, "EN-us")).toBe("en");
  });

  it("falls back to Italian for any other browser language or none", () => {
    expect(chooseLanguage(undefined, "it-IT")).toBe("it");
    expect(chooseLanguage(undefined, "fr-FR")).toBe("it");
    expect(chooseLanguage(undefined, "")).toBe("it");
    expect(chooseLanguage(undefined, undefined)).toBe("it");
  });

  it("ignores a saved value that is not a language", () => {
    expect(chooseLanguage("de", "en-US")).toBe("en");
    expect(chooseLanguage(42, "fr")).toBe("it");
  });
});

describe("active language", () => {
  it("starts as Italian, so existing behaviour is unchanged", () => {
    expect(currentLanguage()).toBe("it");
    expect(t("toast.audioOff")).toBe("Audio disattivato");
  });

  it("switches the catalog that t reads", () => {
    setLanguage("en");
    expect(currentLanguage()).toBe("en");
    expect(t("toast.audioOff")).toBe("Audio off");
    setLanguage("it");
    expect(t("toast.audioOff")).toBe("Audio disattivato");
  });
});

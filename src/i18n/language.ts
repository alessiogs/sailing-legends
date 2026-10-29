/** The languages the game is translated into. */
export const LANGUAGES = ["it", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(l => l === value);

/**
 * The language to start in: the saved choice, else the browser's language (English for "en", "en-GB", …),
 * else Italian. `saved` is whatever was stored, so it may be anything.
 */
export function chooseLanguage(saved: unknown, browser: string | undefined): Language {
  if (isLanguage(saved)) return saved;
  return /^en(-|_|$)/i.test(browser ?? "") ? "en" : "it";
}

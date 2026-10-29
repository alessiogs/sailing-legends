/**
 * Translation: every text the player reads comes from a catalog in this folder (ADR 0001).
 *
 * A catalog maps a key to a message: a string, or a function of typed parameters when the message has any.
 * The Italian catalog (`it.ts`) is the reference: it defines the keys and each message's parameters, and every
 * other catalog has the type `Catalog`, so a key missing from, or added only to, one language fails the build.
 * Plural forms come from the language's plural rules (`plural.ts`), never from `n === 1` checks.
 *
 * Key convention: `area.name` in camelCase, with more dotted segments for variants of one message
 * (`hud.phase.prestart`, `trim.luffing`). Areas: `menu`, `pause`, `controls`, `key`, `toast`, `event`, `coach`, `call`, `race`, `hud`,
 * `trim`, `standings`, `results`, `career`.
 *
 * Static text in `index.html` names its key in a `data-i18n` (text) or `data-i18n-aria-label` attribute and is filled
 * at startup by `ui/pageText.ts`.
 */
import { english } from "./en";
import { italian } from "./it";
import type { Language } from "./language";

export { chooseLanguage, isLanguage, LANGUAGES, type Language } from "./language";

/** The messages of one language. */
export type Catalog = { readonly [K in MessageKey]: (typeof italian)[K] };

export type MessageKey = keyof typeof italian;

/** The parameters a message takes, as a rest tuple: empty for a plain string. */
export type MessageParams<K extends MessageKey> = (typeof italian)[K] extends (params: infer P) => string ? [params: P] : [];

const catalogs: Readonly<Record<Language, Catalog>> = { it: italian, en: english };

/** Italian until `setLanguage` says otherwise, so code and tests that never choose a language read Italian. */
let language: Language = "it";
let active: Catalog = catalogs[language];

/** Makes `language` the one `t` and `lookup` read. The page text and any text already shown are not redone. */
export function setLanguage(next: Language) {
  language = next;
  active = catalogs[next];
}

export function currentLanguage(): Language {
  return language;
}

/** Whether the player is on a touch screen: messages that name a key are then read from their `.touch` variant. */
let touch = false;

/** Words the messages for a touch screen (or back for a keyboard). Set once at startup, before any text is shown. */
export function setTouchWording(on: boolean) {
  touch = on;
}

/** The message under `key`, or under `key.touch` when the player is on a touch screen and the catalog has one. */
function message(key: string): unknown {
  const catalog = active as Readonly<Record<string, unknown>>;
  return (touch ? catalog[`${key}.touch`] : undefined) ?? catalog[key];
}

/** The text of a message in the active language. */
export function t<K extends MessageKey>(key: K, ...params: MessageParams<K>): string {
  const found = message(key) as string | ((params: never) => string);
  return typeof found === "string" ? found : (found as (p: unknown) => string)(params[0]);
}

/**
 * A message without parameters, by a key only known at runtime (the page's `data-i18n` attributes);
 * `undefined` when there is no such key or the message takes parameters.
 */
export function lookup(key: string): string | undefined {
  const text = message(key);
  return typeof text === "string" ? text : undefined;
}

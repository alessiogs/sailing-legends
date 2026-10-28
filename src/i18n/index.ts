/**
 * Translation: every text the player reads comes from a catalog in this folder (ADR 0001).
 *
 * A catalog maps a key to a message: a string, or a function of typed parameters when the message has any.
 * The Italian catalog (`it.ts`) is the reference: it defines the keys and each message's parameters, and every
 * other catalog has the type `Catalog`, so a key missing from, or added only to, one language fails the build.
 * Plural forms come from the language's plural rules (`plural.ts`), never from `n === 1` checks.
 *
 * Key convention: `area.name` in camelCase, with more dotted segments for variants of one message
 * (`hud.phase.prestart`, `trim.luffing`). Areas: `menu`, `controls`, `toast`, `coach`, `call`, `hud`, `trim`,
 * `standings`, `results`.
 */
import { italian } from "./it";

/** The messages of one language. */
export type Catalog = { readonly [K in MessageKey]: (typeof italian)[K] };

export type MessageKey = keyof typeof italian;

/** The parameters a message takes, as a rest tuple: empty for a plain string. */
export type MessageParams<K extends MessageKey> = (typeof italian)[K] extends (params: infer P) => string ? [params: P] : [];

/** Italian is the only language for now. */
const active: Catalog = italian;

/** The text of a message in the active language. */
export function t<K extends MessageKey>(key: K, ...params: MessageParams<K>): string {
  const message: string | ((params: never) => string) = active[key];
  return typeof message === "string" ? message : (message as (p: unknown) => string)(params[0]);
}

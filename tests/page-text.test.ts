/**
 * Static page text: index.html names catalog keys (data-i18n, data-i18n-aria-label) instead of holding Italian
 * text. Filled from the catalog, the page must read word for word as in `page-text/original.json`: the visible text
 * and aria-labels of the page as it was before its text moved to the catalog (the HUD part follows the 0.6a "Sail number" HUD).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookup } from "../src/i18n";
import original from "./page-text/original.json";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Elements whose text the game sets at runtime, before they are first seen; their placeholder text is not compared. */
const filledAtRuntime = ["version-chip", "leg", "leeway", "key-left-label", "key-right-label"];

/** The same filling as `src/ui/pageText.ts`, on the HTML source: an element's text replaces its content when it has
 * no child elements, and goes before its children otherwise. */
function fill(html: string): string {
  const text = (key: string) => {
    const message = lookup(key);
    if (message === undefined) throw new Error(`no catalog message without parameters for "${key}"`);
    return message;
  };
  return html
    .replace(/<(\w+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>[^<]*<\/\1>/g, (_m, tag: string, attrs: string, key: string) =>
      `<${tag}${attrs.replace(/\sdata-i18n="[^"]+"/, "")}>${text(key)}</${tag}>`)
    .replace(/<(\w+)([^>]*)\sdata-i18n="([^"]+)"([^>]*)>/g, (_m, tag: string, a: string, key: string, b: string) => `<${tag}${a}${b}>${text(key)}`)
    .replace(/\sdata-i18n-aria-label="([^"]+)"/g, (_m, key: string) => ` aria-label="${text(key)}"`);
}

function body(html: string): string {
  let body = html.slice(html.indexOf("<body>")).replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, "");
  for (const id of filledAtRuntime) body = body.replace(new RegExp(`(<(\\w+)[^>]*\\sid="${id}"[^>]*>)[^<]*(</\\2>)`), "$1$3");
  return body.replace(/\s+/g, " ");
}

/** The text a player reads: one line per block element, with inline elements joined as the browser joins them. */
function visibleText(html: string): { lines: string[]; ariaLabels: string[] } {
  const b = body(html);
  const lines = b
    .replace(/<\/?(span|b|kbd|i|u|em|strong|small|input)\b[^>]*>/g, "")
    .split(/<[^>]*>/)
    .map(line => line.trim())
    .filter(line => line !== "");
  const ariaLabels = Array.from(b.matchAll(/\saria-label="([^"]*)"/g), m => m[1]);
  return { lines, ariaLabels };
}

/** Every piece of text between two tags. */
function textPieces(html: string): string[] {
  return body(html).split(/<[^>]*>/).map(piece => piece.trim()).filter(piece => piece !== "");
}

describe("static page text", () => {
  it("names only catalog messages without parameters", () => {
    const keys = Array.from(page.matchAll(/\sdata-i18n(?:-aria-label)?="([^"]+)"/g), m => m[1]);
    expect(keys.length > 0).toBe(true);
    for (const key of keys) expect(lookup(key), key).toBeDefined();
  });

  it("reads exactly as before once filled from the catalog", () => {
    expect(visibleText(fill(page))).toEqual(original);
  });

  it("holds no text of its own that the catalog does not supply", () => {
    // Left in the page: the brand, boat class names, key and button names, units and the instruments' start values.
    const allowed = /^(SAILING|LEGENDS|Optimist|420|[A-Z]|[←→↑↓/·+–—]|RT|LT|RT \/ LT|Shift|Esc|Start|Back|-0:45|0\.0|kn|0°|11 kn)$/;
    const loading = lookup("menu.loading");
    const ownText = textPieces(page).filter(line => !allowed.test(line) && line !== loading);
    expect(ownText).toEqual([]);
  });
});

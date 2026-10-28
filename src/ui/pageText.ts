/**
 * Static page text: elements in `index.html` name a catalog key instead of holding Italian text.
 * `data-i18n="key"` gives an element its text, placed before any child elements (key hints such as `<span>K</span>`
 * stay as they are); `data-i18n-aria-label="key"` gives it an aria-label.
 */
import { lookup } from "../i18n";

function message(key: string): string {
  const text = lookup(key);
  if (text === undefined) throw new Error(`index.html: no catalog message without parameters for "${key}"`);
  return text;
}

/** Fills the page's static text from the catalog. Run once at startup, before any screen is shown. */
export function fillPageText(root: ParentNode = document) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const text = message(el.dataset.i18n!);
    if (el.childElementCount === 0) el.textContent = text;
    else el.insertBefore(document.createTextNode(text), el.firstChild);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]"))) {
    el.setAttribute("aria-label", message(el.dataset.i18nAriaLabel!));
  }
}

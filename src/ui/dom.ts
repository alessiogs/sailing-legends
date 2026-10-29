/** Attributes for `h`: `class`, `style` and any other attribute, set as plain attribute values. */
type Attributes = Record<string, string>;

/**
 * Builds an element from attributes and children. String children become text nodes, never markup,
 * so a sailor's name (or any other text) can't add elements or attributes to the page.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attributes: Attributes = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

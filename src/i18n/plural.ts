/** Plural forms of a message, by the language's plural categories (CLDR). `other` is required as the fallback. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** Picks the plural form for a count, following one language's plural rules (`Intl.PluralRules`). */
export type PluralSelector = (count: number, forms: PluralForms) => string;

export function plurals(locale: string): PluralSelector {
  const rules = new Intl.PluralRules(locale);
  return (count, forms) => forms[rules.select(count)] ?? forms.other;
}

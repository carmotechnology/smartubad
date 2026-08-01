export const LOCALES = ["en", "so"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  so: "Soomaali",
};

/** Cookie the language switcher writes; read on the server to pick a dictionary. */
export const LOCALE_COOKIE = "smartubad_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Fill `{placeholders}` in a translated string.
 *
 *   interpolate(t.invite.joinAs, { school: "Little Stars", role: "a teacher" })
 *
 * Lives here rather than in `index.ts` because client components need it, and
 * `index.ts` imports `next/headers`, which cannot cross into a client bundle.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

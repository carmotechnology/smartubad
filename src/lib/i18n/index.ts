import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { so } from "./dictionaries/so";

const DICTIONARIES: Record<Locale, Dictionary> = { en, so };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Resolve the request's locale on the server.
 *
 * Order: the user's explicit choice (cookie) beats the school's default, which
 * beats English. A person who switches to Somali stays in Somali even if their
 * school is set to English.
 */
export async function getLocale(tenantLocale?: string | null): Promise<Locale> {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;

  if (cookieLocale) return resolveLocale(cookieLocale);
  if (tenantLocale) return resolveLocale(tenantLocale);
  return DEFAULT_LOCALE;
}

export async function getTranslations(tenantLocale?: string | null): Promise<{
  locale: Locale;
  t: Dictionary;
}> {
  const locale = await getLocale(tenantLocale);
  return { locale, t: getDictionary(locale) };
}

/**
 * Fill `{placeholders}` in a translated string.
 *
 *   interpolate(t.invite.joinAs, { school: "Little Stars", role: "a teacher" })
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type { Dictionary };
export { en, so };
export * from "./config";

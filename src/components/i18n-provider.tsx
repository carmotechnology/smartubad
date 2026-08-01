"use client";

import * as React from "react";

import { interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";

type I18nValue = {
  locale: Locale;
  t: Dictionary;
  /** Fill `{placeholders}` in a translated string. */
  fill: (template: string, values: Record<string, string | number>) => string;
};

const I18nContext = React.createContext<I18nValue | null>(null);

/**
 * Server components read the dictionary directly via `getTranslations()`.
 * This provider exists so client components (forms, the attendance roster)
 * can reach the same strings without prop-drilling them through every level.
 */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  const value = React.useMemo<I18nValue>(
    () => ({ locale, t: dictionary, fill: interpolate }),
    [locale, dictionary],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside an <I18nProvider>");
  }
  return context;
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Writes the locale cookie and refreshes so the server re-renders with the
 * other dictionary. A cookie rather than a URL segment keeps every route in
 * the app free of a `/[locale]/` prefix — one less thing to get wrong in
 * links, and the choice follows the user across schools.
 */
export function LanguageSwitcher({
  current,
  className,
  compact = false,
}: {
  current: Locale;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    // Max-Age one year. Not httpOnly on purpose: it is a display preference,
    // carries nothing sensitive, and the client needs to set it.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  if (compact) {
    return (
      <div
        className={cn("inline-flex rounded-lg border border-[var(--border)] p-0.5", className)}
        role="group"
        aria-label="Language"
      >
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => switchTo(locale)}
            disabled={pending}
            aria-pressed={locale === current}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium uppercase transition-colors",
              locale === current
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
            )}
          >
            {locale}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className={cn("flex items-center gap-2 text-sm", className)}>
      <Languages className="size-4 text-[var(--muted-foreground)]" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={current}
        disabled={pending}
        onChange={(event) => switchTo(event.target.value as Locale)}
        className="rounded-lg border border-[var(--input)] bg-[var(--card)] px-2.5 py-1.5 text-sm"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}

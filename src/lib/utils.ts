import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Money -----------------------------------------------------------------

/** Amounts are stored as integer minor units; format for display only. */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = "en",
): string {
  try {
    return new Intl.NumberFormat(locale === "so" ? "so-SO" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function toMajor(amountMinor: number): number {
  return amountMinor / 100;
}

// --- Dates -----------------------------------------------------------------

/** `YYYY-MM-DD` in the given IANA timezone — the school's "today". */
export function todayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDate(value: string | Date, locale = "en", timezone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "so" ? "so-SO" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

export function formatTime(value: string | Date | null, timezone?: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

export function formatDateTime(value: string | Date, locale = "en", timezone?: string): string {
  return `${formatDate(value, locale, timezone)} · ${formatTime(value, timezone)}`;
}

/** Whole years, then months for under-twos — how nurseries actually talk. */
export function formatAge(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "—";

  const now = new Date();
  let months =
    (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 0) return "—";

  const years = Math.floor(months / 12);
  const remainder = months % 12;

  if (years === 0) return `${months}m`;
  if (years < 2 && remainder > 0) return `${years}y ${remainder}m`;
  return `${years}y`;
}

export function relativeDeadline(iso: string, locale = "en"): string {
  const target = new Date(iso).getTime();
  const diffHours = Math.round((target - Date.now()) / (1000 * 60 * 60));

  const rtf = new Intl.RelativeTimeFormat(locale === "so" ? "so" : "en", {
    numeric: "auto",
  });

  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  return rtf.format(Math.round(diffHours / 24), "day");
}

// --- Names -----------------------------------------------------------------

export function childDisplayName(child: {
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
}): string {
  const first = child.preferred_name?.trim() || child.first_name;
  return `${first} ${child.last_name}`.trim();
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// --- Misc ------------------------------------------------------------------

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Empty strings from HTML forms should be NULL in the database, not "". */
export function emptyToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

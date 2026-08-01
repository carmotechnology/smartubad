import type { AllergySeverity } from "@/lib/supabase/database.types";

/**
 * Allergy helpers that run on BOTH the server and the client.
 *
 * Kept out of `lib/db/queries.ts` on purpose: that module is `server-only`,
 * and the attendance roster — a client component — needs to rank severity to
 * decide how loud a badge should be.
 */

const SEVERITY_ORDER: AllergySeverity[] = ["severe", "moderate", "mild"];

/** The highest severity across a child's allergies, or null if they have none. */
export function worstSeverity(
  allergies: { severity: AllergySeverity }[],
): AllergySeverity | null {
  for (const severity of SEVERITY_ORDER) {
    if (allergies.some((allergy) => allergy.severity === severity)) return severity;
  }
  return null;
}

export function hasSevereAllergy(allergies: { severity: AllergySeverity }[]): boolean {
  return allergies.some((allergy) => allergy.severity === "severe");
}

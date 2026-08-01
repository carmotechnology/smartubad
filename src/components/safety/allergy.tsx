import { AlertTriangle, Pill, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { ChildAllergyRow } from "@/lib/supabase/database.types";
import { worstSeverity } from "@/lib/safety";

/**
 * Allergy surfaces. Safety-critical, so the rules are deliberate:
 *
 *  - The roster badge is never hidden behind a hover or a tooltip; it is
 *    visible at a glance while scrolling a list of twenty children.
 *  - The detail banner sits at the very TOP of the child view, above the
 *    photo and the name, and states allergen + severity + what to do.
 *  - Severity colour is reinforced with an icon and a word, so it still reads
 *    correctly for a colour-blind teacher or on a washed-out phone screen.
 */

/** Compact chip for rosters and lists. */
export function AllergyBadge({
  allergies,
  t,
  className,
}: {
  allergies: Pick<ChildAllergyRow, "severity" | "allergen">[];
  t: Dictionary;
  className?: string;
}) {
  if (allergies.length === 0) return null;

  const severity = worstSeverity(allergies);
  const isSevere = severity === "severe";

  return (
    <Badge
      variant={isSevere ? "destructive" : "alert"}
      className={cn("shrink-0 gap-1", className)}
      title={allergies.map((a) => a.allergen).join(", ")}
    >
      {isSevere ? <ShieldAlert aria-hidden /> : <AlertTriangle aria-hidden />}
      <span>
        {isSevere ? t.allergies.severeBadge : t.allergies.badge}
        {allergies.length > 1 ? ` ×${allergies.length}` : ""}
      </span>
    </Badge>
  );
}

const severityStyles = {
  severe: {
    wrap: "border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))]",
    chip: "destructive" as const,
  },
  moderate: {
    wrap: "border-[color-mix(in_oklch,var(--warning)_60%,transparent)] bg-[color-mix(in_oklch,var(--warning)_14%,var(--card))]",
    chip: "warning" as const,
  },
  mild: {
    wrap: "border-[var(--border)] bg-[var(--muted)]",
    chip: "muted" as const,
  },
};

/**
 * The banner that goes at the top of a child's detail view, and on meal /
 * menu views. Impossible to miss, and every line a teacher needs is here —
 * no second tap required.
 */
export function AllergyBanner({
  allergies,
  t,
  className,
}: {
  allergies: ChildAllergyRow[];
  t: Dictionary;
  className?: string;
}) {
  if (allergies.length === 0) return null;

  const severity = worstSeverity(allergies) ?? "mild";
  const styles = severityStyles[severity];
  const count = allergies.length;

  return (
    <section
      // `alert` so a screen reader announces it as soon as the page loads,
      // rather than only when the user tabs into it.
      role="alert"
      aria-label={t.allergies.bannerTitle}
      className={cn(
        "rounded-xl border-2 p-4",
        styles.wrap,
        severity === "severe" && "pulse-alert",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 shrink-0 text-[var(--destructive)]" aria-hidden />
        <h2 className="font-semibold">{t.allergies.bannerTitle}</h2>
        <Badge variant={styles.chip} className="ml-auto">
          {(count === 1 ? t.allergies.bannerSingle : t.allergies.bannerPlural).replace(
            "{count}",
            String(count),
          )}
        </Badge>
      </div>

      <ul className="mt-3 space-y-3">
        {allergies.map((allergy) => (
          <li
            key={allergy.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{allergy.allergen}</span>
              <Badge
                variant={
                  allergy.severity === "severe"
                    ? "destructive"
                    : allergy.severity === "moderate"
                      ? "warning"
                      : "muted"
                }
              >
                {t.allergies.severities[allergy.severity]}
              </Badge>
            </div>

            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-[var(--muted-foreground)]">
                  {t.allergies.reaction}:
                </dt>
                <dd>{allergy.reaction}</dd>
              </div>

              {/* The single most important line on the page. */}
              <div className="rounded-md bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] p-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--destructive)]">
                  {t.allergies.requiredAction}
                </dt>
                <dd className="mt-0.5 font-medium">{allergy.required_action}</dd>
              </div>

              {allergy.medication ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[var(--muted-foreground)]">
                  <Pill className="size-3.5" aria-hidden />
                  <span>{allergy.medication}</span>
                  {allergy.medication_location ? (
                    <span>— {allergy.medication_location}</span>
                  ) : null}
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One-line summary for dense tables. */
export function AllergySummary({
  allergies,
  t,
}: {
  allergies: ChildAllergyRow[];
  t: Dictionary;
}) {
  if (allergies.length === 0) {
    return <span className="text-sm text-[var(--muted-foreground)]">{t.allergies.noAllergies}</span>;
  }

  return (
    <span className="text-sm">
      {allergies.map((allergy, index) => (
        <span key={allergy.id}>
          {index > 0 ? ", " : ""}
          <span className={allergy.severity === "severe" ? "font-semibold text-[var(--destructive)]" : ""}>
            {allergy.allergen}
          </span>
        </span>
      ))}
    </span>
  );
}

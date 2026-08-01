import * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholder. Shape it with width/height classes. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden {...props} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Empty state. Always says what the user can do next — an empty screen with
 * no prompt is the most common way a new admin gets stuck.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const alertTones = {
  info: "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]",
  warning:
    "border-[color-mix(in_oklch,var(--warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--warning)_18%,var(--card))] text-[var(--foreground)]",
  danger:
    "border-[color-mix(in_oklch,var(--destructive)_45%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] text-[var(--foreground)]",
  success:
    "border-[color-mix(in_oklch,var(--success)_45%,transparent)] bg-[color-mix(in_oklch,var(--success)_12%,var(--card))] text-[var(--foreground)]",
} as const;

export function Alert({
  tone = "info",
  icon,
  title,
  children,
  className,
  role = "status",
}: {
  tone?: keyof typeof alertTones;
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm",
        alertTones[tone],
        className,
      )}
    >
      {icon ? <div className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</div> : null}
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[var(--muted-foreground)]">{children}</div> : null}
      </div>
    </div>
  );
}

/** Page heading with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? (
          <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Compact metric tile for the dashboards. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const valueTone =
    tone === "success"
      ? "text-[var(--success)]"
      : tone === "warning"
        ? "text-[var(--warning)]"
        : tone === "danger"
          ? "text-[var(--destructive)]"
          : "text-[var(--foreground)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </p>
        {icon ? <div className="text-[var(--muted-foreground)] [&_svg]:size-4">{icon}</div> : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueTone)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}

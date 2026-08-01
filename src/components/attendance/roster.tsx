"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, LogIn, LogOut } from "lucide-react";

import { AllergyBadge } from "@/components/safety/allergy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { saveAttendance } from "@/app/[tenantSlug]/attendance/actions";
import { cn, childDisplayName, formatTime, initials } from "@/lib/utils";
import type { AttendanceStatus, ChildAllergyRow } from "@/lib/supabase/database.types";

export type RosterChild = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  allergies: ChildAllergyRow[];
  status: AttendanceStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  droppedOffBy: string | null;
  pickedUpBy: string | null;
};

type Entry = {
  status: AttendanceStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  droppedOffBy: string;
  pickedUpBy: string;
};

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "late"];

/**
 * The register. Built for a phone held in one hand:
 *  - three big status buttons per child, no dropdowns;
 *  - allergy badge inline, so nothing is discovered too late;
 *  - the child's name is a link into their full record (allergies on top);
 *  - a single save at the bottom that stays in reach while scrolling.
 */
export function AttendanceRoster({
  tenantSlug,
  classId,
  date,
  timezone,
  children,
  canWrite,
}: {
  tenantSlug: string;
  classId: string;
  date: string;
  timezone: string;
  children: RosterChild[];
  canWrite: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const [entries, setEntries] = React.useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      children.map((child) => [
        child.id,
        {
          status: child.status,
          checkInAt: child.checkInAt,
          checkOutAt: child.checkOutAt,
          droppedOffBy: child.droppedOffBy ?? "",
          pickedUpBy: child.pickedUpBy ?? "",
        },
      ]),
    ),
  );

  function update(childId: string, patch: Partial<Entry>) {
    setEntries((current) => ({ ...current, [childId]: { ...current[childId], ...patch } }));
  }

  function setStatus(childId: string, status: AttendanceStatus) {
    const entry = entries[childId];
    update(childId, {
      status,
      // Marking present or late stamps the arrival time automatically —
      // that is what the teacher means, and it saves a second interaction.
      checkInAt:
        (status === "present" || status === "late") && !entry.checkInAt
          ? new Date().toISOString()
          : status === "absent"
            ? null
            : entry.checkInAt,
      checkOutAt: status === "absent" ? null : entry.checkOutAt,
    });
  }

  function markAllPresent() {
    const now = new Date().toISOString();
    setEntries((current) =>
      Object.fromEntries(
        Object.entries(current).map(([childId, entry]) => [
          childId,
          { ...entry, status: "present", checkInAt: entry.checkInAt ?? now },
        ]),
      ),
    );
  }

  const marked = Object.values(entries).filter((entry) => entry.status !== null).length;

  async function onSave() {
    setPending(true);
    const payload = Object.entries(entries)
      .filter(([, entry]) => entry.status !== null)
      .map(([childId, entry]) => ({
        childId,
        status: entry.status as AttendanceStatus,
        checkInAt: entry.checkInAt,
        checkOutAt: entry.checkOutAt,
        droppedOffBy: entry.droppedOffBy,
        pickedUpBy: entry.pickedUpBy,
        notes: "",
      }));

    if (payload.length === 0) {
      setPending(false);
      toast.error(t.attendance.notMarked);
      return;
    }

    const result = await saveAttendance(tenantSlug, { classId, date, entries: payload });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(t.attendance.savedToast);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            {marked} / {children.length}
            {marked === children.length ? ` · ${t.attendance.dayComplete}` : ""}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
            <CheckCheck aria-hidden />
            {t.attendance.markAll}
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {children.map((child) => {
          const entry = entries[child.id];
          const isOpen = expanded === child.id;

          return (
            <li
              key={child.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-medium text-[var(--muted-foreground)]">
                  {initials(childDisplayName({
                    first_name: child.firstName,
                    last_name: child.lastName,
                    preferred_name: child.preferredName,
                  }))}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${tenantSlug}/children/${child.id}`}
                    className="block truncate font-medium underline-offset-4 hover:underline"
                  >
                    {childDisplayName({
                      first_name: child.firstName,
                      last_name: child.lastName,
                      preferred_name: child.preferredName,
                    })}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <AllergyBadge allergies={child.allergies} t={t} />
                    {entry.checkInAt ? (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {t.attendance.checkedInAt.replace(
                          "{time}",
                          formatTime(entry.checkInAt, timezone),
                        )}
                      </span>
                    ) : null}
                    {entry.checkOutAt ? (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {t.attendance.checkedOutAt.replace(
                          "{time}",
                          formatTime(entry.checkOutAt, timezone),
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {canWrite ? (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {STATUS_OPTIONS.map((status) => {
                      const active = entry.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setStatus(child.id, status)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-12 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
                            active
                              ? status === "present"
                                ? "border-transparent bg-[var(--success)] text-[var(--success-foreground)]"
                                : status === "late"
                                  ? "border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]"
                                  : "border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)]"
                              : "border-[var(--border)] hover:bg-[var(--muted)]",
                          )}
                        >
                          {active ? <Check className="size-4" aria-hidden /> : null}
                          {t.attendance[status]}
                        </button>
                      );
                    })}
                  </div>

                  {entry.status && entry.status !== "absent" ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : child.id)}
                        className="text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                      >
                        {isOpen ? t.common.close : `${t.attendance.checkOut} / ${t.attendance.pickedUpBy}`}
                      </button>

                      {isOpen ? (
                        <div className="mt-2 space-y-2 rounded-lg bg-[var(--muted)] p-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              placeholder={t.attendance.droppedOffBy}
                              aria-label={t.attendance.droppedOffBy}
                              value={entry.droppedOffBy}
                              onChange={(event) =>
                                update(child.id, { droppedOffBy: event.target.value })
                              }
                            />
                            <Input
                              placeholder={t.attendance.pickedUpBy}
                              aria-label={t.attendance.pickedUpBy}
                              value={entry.pickedUpBy}
                              onChange={(event) =>
                                update(child.id, { pickedUpBy: event.target.value })
                              }
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                update(child.id, { checkInAt: new Date().toISOString() })
                              }
                            >
                              <LogIn aria-hidden />
                              {t.attendance.checkIn}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                update(child.id, { checkOutAt: new Date().toISOString() })
                              }
                            >
                              <LogOut aria-hidden />
                              {t.attendance.checkOut}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  {entry.status ? t.attendance[entry.status] : t.attendance.notMarked}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {canWrite ? (
        <div className="sticky bottom-16 z-20 lg:bottom-4">
          <Button type="button" size="touch" onClick={onSave} disabled={pending}>
            {pending ? t.common.saving : t.attendance.saveAttendance}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { ClipboardList, GraduationCap } from "lucide-react";

import { AttendanceRoster, type RosterChild } from "@/components/attendance/roster";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { classRoster, classesForUser } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { formatDate, todayInTimezone } from "@/lib/utils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;

  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  // "Today" is the school's today, not the server's — a nursery in Mogadishu
  // must not roll over at midnight UTC.
  const date = query.date ?? todayInTimezone(ctx.tenant.timezone);

  if (!ctx.activeYear) {
    return (
      <>
        <PageHeader title={t.attendance.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const classes = await classesForUser(db, ctx.activeYear.id, ctx.profile.id, ctx.role);

  if (classes.length === 0) {
    return (
      <>
        <PageHeader title={t.attendance.title} />
        <EmptyState
          icon={<GraduationCap />}
          title={t.attendance.noClassAssigned}
          description={t.attendance.noClassAssignedBody}
        />
      </>
    );
  }

  const selectedClassId = query.class ?? classes[0].id;
  const selectedClass = classes.find((klass) => klass.id === selectedClassId) ?? classes[0];

  const roster = await classRoster(db, selectedClass.id, ctx.activeYear.id, date);
  const canRecord = can(ctx.role, "attendance.record") && ctx.canWrite;

  const rosterChildren: RosterChild[] = roster.map((entry) => ({
    id: entry.id,
    firstName: entry.first_name,
    lastName: entry.last_name,
    preferredName: entry.preferred_name,
    allergies: entry.allergies,
    status: entry.attendance?.status ?? null,
    checkInAt: entry.attendance?.check_in_at ?? null,
    checkOutAt: entry.attendance?.check_out_at ?? null,
    droppedOffBy: entry.attendance?.dropped_off_by ?? null,
    pickedUpBy: entry.attendance?.picked_up_by ?? null,
  }));

  return (
    <>
      <PageHeader
        title={t.attendance.title}
        description={`${selectedClass.name} · ${formatDate(date, ctx.tenant.locale)}`}
      />

      {classes.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {classes.map((klass) => (
            <Button
              key={klass.id}
              asChild
              variant={klass.id === selectedClass.id ? "default" : "outline"}
              size="sm"
            >
              <Link
                href={`/${tenantSlug}/attendance?class=${klass.id}&date=${date}`}
                scroll={false}
              >
                {klass.name}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-5 sm:pt-6">
          <form className="flex flex-wrap items-end gap-2" action={`/${tenantSlug}/attendance`}>
            <input type="hidden" name="class" value={selectedClass.id} />
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t.finance.date}</span>
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="h-11 rounded-lg border border-[var(--input)] bg-[var(--card)] px-3"
              />
            </label>
            <Button type="submit" variant="secondary">
              {t.common.search}
            </Button>
          </form>
        </CardContent>
      </Card>

      {rosterChildren.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t.children.noChildren}
          description={t.children.noChildrenBody}
        />
      ) : (
        <AttendanceRoster
          tenantSlug={tenantSlug}
          classId={selectedClass.id}
          date={date}
          timezone={ctx.tenant.timezone}
          children={rosterChildren}
          canWrite={canRecord}
        />
      )}
    </>
  );
}

import Link from "next/link";
import { CalendarDays, ClipboardList, Megaphone, Users, Wallet } from "lucide-react";

import { AllergyBadge } from "@/components/safety/allergy";
import { Alert, PageHeader, StatCard } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantContext, type TenantContext } from "@/lib/auth/session";
import { scoped, type TenantScope } from "@/lib/db/scope";
import {
  attendanceTotals,
  childrenForParent,
  classesForUser,
  classRoster,
} from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { childDisplayName, formatDate, formatMoney, todayInTimezone } from "@/lib/utils";
import type {
  AnnouncementRow,
  CalendarEventRow,
  DailyReportRow,
  FeeRow,
  TransactionRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  const greeting = pickGreeting(t, ctx.tenant.timezone);
  const firstName = (ctx.profile.full_name ?? ctx.profile.email).split(" ")[0];

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={ctx.activeYear?.name ?? t.dashboard.noActiveYear}
      />

      {!ctx.activeYear ? (
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          <p>{t.dashboard.noActiveYearBody}</p>
          {ctx.role === "owner" || ctx.role === "admin" ? (
            <Button asChild size="sm" className="mt-3">
              <Link href={`/${tenantSlug}/settings`}>{t.dashboard.createAcademicYear}</Link>
            </Button>
          ) : null}
        </Alert>
      ) : ctx.role === "parent" ? (
        <ParentDashboard ctx={ctx} db={db} t={t} tenantSlug={tenantSlug} />
      ) : ctx.role === "teacher" ? (
        <TeacherDashboard ctx={ctx} db={db} t={t} tenantSlug={tenantSlug} />
      ) : (
        <AdminDashboard ctx={ctx} db={db} t={t} tenantSlug={tenantSlug} />
      )}
    </>
  );
}

function pickGreeting(t: Dictionary, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date()),
  );
  if (hour < 12) return t.dashboard.goodMorning;
  if (hour < 17) return t.dashboard.goodAfternoon;
  return t.dashboard.goodEvening;
}

type PanelProps = {
  ctx: TenantContext;
  db: TenantScope;
  t: Dictionary;
  tenantSlug: string;
};

// --- Admin -----------------------------------------------------------------

async function AdminDashboard({ ctx, db, t, tenantSlug }: PanelProps) {
  const yearId = ctx.activeYear!.id;
  const today = todayInTimezone(ctx.tenant.timezone);

  const [childCount, staffCount, totals, feesResult, txResult, announcementsResult] =
    await Promise.all([
      db.count("children", (q) => q.eq("status", "active")),
      db.count("profiles", (q) => q.in("role", ["owner", "admin", "teacher"])),
      attendanceTotals(db, yearId, today),
      db.selectForYear("fees", yearId, "amount_minor, paid_minor, status"),
      db.selectForYear("transactions", yearId, "kind, amount_minor"),
      db
        .selectForYear("announcements", yearId)
        .order("published_at", { ascending: false })
        .limit(3),
    ]);

  const fees = (feesResult.data ?? []) as Pick<
    FeeRow,
    "amount_minor" | "paid_minor" | "status"
  >[];
  const outstanding = fees
    .filter((fee) => fee.status !== "waived")
    .reduce((sum, fee) => sum + Math.max(0, fee.amount_minor - fee.paid_minor), 0);

  const transactions = (txResult.data ?? []) as Pick<TransactionRow, "kind" | "amount_minor">[];
  const income = transactions
    .filter((tx) => tx.kind === "income")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);
  const expenses = transactions
    .filter((tx) => tx.kind === "expense")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);

  const announcements = (announcementsResult.data ?? []) as AnnouncementRow[];
  const currency = ctx.tenant.currency;
  const locale = ctx.tenant.locale;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t.dashboard.childrenEnrolled}
          value={childCount}
          icon={<Users />}
        />
        <StatCard label={t.dashboard.staffMembers} value={staffCount} />
        <StatCard
          label={t.dashboard.presentToday}
          value={totals.present + totals.late}
          hint={t.attendance.summary
            .replace("{present}", String(totals.present))
            .replace("{absent}", String(totals.absent))
            .replace("{late}", String(totals.late))}
          tone="success"
          icon={<ClipboardList />}
        />
        <StatCard
          label={t.dashboard.feesOutstanding}
          value={formatMoney(outstanding, currency, locale)}
          tone={outstanding > 0 ? "warning" : "success"}
          icon={<Wallet />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t.dashboard.incomeThisYear}
          value={formatMoney(income, currency, locale)}
          tone="success"
        />
        <StatCard
          label={t.dashboard.expensesThisYear}
          value={formatMoney(expenses, currency, locale)}
        />
        <StatCard
          label={t.dashboard.netThisYear}
          value={formatMoney(income - expenses, currency, locale)}
          tone={income - expenses >= 0 ? "success" : "danger"}
        />
      </div>

      <AnnouncementList
        announcements={announcements}
        t={t}
        locale={locale}
        href={`/${tenantSlug}/announcements`}
      />
    </>
  );
}

// --- Teacher ---------------------------------------------------------------

async function TeacherDashboard({ ctx, db, t, tenantSlug }: PanelProps) {
  const yearId = ctx.activeYear!.id;
  const today = todayInTimezone(ctx.tenant.timezone);
  const classes = await classesForUser(db, yearId, ctx.profile.id, ctx.role);

  if (classes.length === 0) {
    return (
      <Alert tone="info" title={t.attendance.noClassAssigned}>
        {t.attendance.noClassAssignedBody}
      </Alert>
    );
  }

  const rosters = await Promise.all(
    classes.map(async (klass) => ({
      klass,
      roster: await classRoster(db, klass.id, yearId, today),
    })),
  );

  return (
    <div className="space-y-4">
      {rosters.map(({ klass, roster }) => {
        const marked = roster.filter((entry) => entry.attendance !== null).length;
        const present = roster.filter(
          (entry) => entry.attendance?.status === "present" || entry.attendance?.status === "late",
        ).length;
        const withAllergies = roster.filter((entry) => entry.allergies.length > 0);

        return (
          <Card key={klass.id}>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>{klass.name}</CardTitle>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {t.classes.enrolled.replace("{count}", String(roster.length))} ·{" "}
                  {present} {t.attendance.present.toLowerCase()}
                </p>
              </div>
              <Badge variant={marked === roster.length && roster.length > 0 ? "success" : "muted"}>
                {marked}/{roster.length}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-3">
              {withAllergies.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_8%,var(--card))] p-3">
                  <span className="text-sm font-medium">{t.allergies.title}:</span>
                  {withAllergies.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/${tenantSlug}/children/${entry.id}`}
                      className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
                    >
                      {childDisplayName(entry)}
                      <AllergyBadge allergies={entry.allergies} t={t} />
                    </Link>
                  ))}
                </div>
              ) : null}

              <Button asChild size="touch">
                <Link href={`/${tenantSlug}/attendance?class=${klass.id}`}>
                  <ClipboardList aria-hidden />
                  {t.dashboard.takeAttendance}
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- Parent ----------------------------------------------------------------

async function ParentDashboard({ ctx, db, t, tenantSlug }: PanelProps) {
  const yearId = ctx.activeYear!.id;
  const today = todayInTimezone(ctx.tenant.timezone);
  const children = await childrenForParent(db, ctx.profile.id);

  const [announcementsResult, eventsResult] = await Promise.all([
    db
      .selectForYear("announcements", yearId)
      .order("published_at", { ascending: false })
      .limit(3),
    db
      .selectForYear("calendar_events", yearId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(4),
  ]);

  const announcements = (announcementsResult.data ?? []) as AnnouncementRow[];
  const events = (eventsResult.data ?? []) as CalendarEventRow[];

  const childPanels = await Promise.all(
    children.map(async (child) => {
      const [attendanceResult, reportResult] = await Promise.all([
        db
          .select("attendance_records")
          .eq("child_id", child.id)
          .eq("attendance_date", today)
          .maybeSingle(),
        db
          .select("daily_reports")
          .eq("child_id", child.id)
          .eq("is_published", true)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        child,
        attendance: attendanceResult.data as { status: string } | null,
        report: reportResult.data as DailyReportRow | null,
      };
    }),
  );

  return (
    <div className="space-y-4">
      {childPanels.map(({ child, attendance, report }) => (
        <Card key={child.id}>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>{childDisplayName(child)}</CardTitle>
              <p className="text-sm text-[var(--muted-foreground)]">
                {t.dashboard.childsDay}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AllergyBadge allergies={child.allergies} t={t} />
              <Badge
                variant={
                  attendance?.status === "present"
                    ? "success"
                    : attendance?.status === "absent"
                      ? "destructive"
                      : attendance?.status === "late"
                        ? "warning"
                        : "muted"
                }
              >
                {attendance
                  ? t.attendance[attendance.status as "present" | "absent" | "late" | "excused"]
                  : t.attendance.notMarked}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {report ? (
              <div className="rounded-lg bg-[var(--muted)] p-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {t.dashboard.latestReport} ·{" "}
                  {formatDate(report.report_date, ctx.tenant.locale)}
                </p>
                {report.mood ? (
                  <p className="font-medium">
                    {t.reports.mood}: {t.reports.moods[report.mood]}
                  </p>
                ) : null}
                {report.activities ? <p className="mt-1">{report.activities}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                {t.dashboard.noReportYet}
              </p>
            )}

            <Button asChild variant="outline" size="sm">
              <Link href={`/${tenantSlug}/children/${child.id}`}>{t.common.viewAll}</Link>
            </Button>
          </CardContent>
        </Card>
      ))}

      <AnnouncementList
        announcements={announcements}
        t={t}
        locale={ctx.tenant.locale}
        href={`/${tenantSlug}/announcements`}
      />

      {events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden />
              {t.dashboard.upcomingEvents}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{event.title}</span>
                  <span className="shrink-0 text-[var(--muted-foreground)]">
                    {formatDate(event.starts_at, ctx.tenant.locale, ctx.tenant.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AnnouncementList({
  announcements,
  t,
  locale,
  href,
}: {
  announcements: AnnouncementRow[];
  t: Dictionary;
  locale: string;
  href: string;
}) {
  if (announcements.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4" aria-hidden />
          {t.dashboard.recentAnnouncements}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{t.common.viewAll}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
              <p className="font-medium">{announcement.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                {announcement.body}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {formatDate(announcement.published_at, locale)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

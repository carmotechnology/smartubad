import { FileText } from "lucide-react";

import { DailyReportForm } from "@/components/reports/daily-report-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatDate, todayInTimezone } from "@/lib/utils";
import type { DailyReportRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Daily reports" };

type Meal = { type: string; amount: string; note?: string };

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  if (!ctx.activeYear) {
    return (
      <>
        <PageHeader title={t.reports.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const canWrite = can(ctx.role, "reports.write") && ctx.canWrite;
  const today = todayInTimezone(ctx.tenant.timezone);

  const [{ data }, children] = await Promise.all([
    db
      .selectForYear("daily_reports", ctx.activeYear.id)
      .order("report_date", { ascending: false })
      .limit(50),
    canWrite ? listChildrenWithSafety(db) : Promise.resolve([]),
  ]);

  const reports = (data ?? []) as DailyReportRow[];
  const childNames = new Map(
    (await listChildrenWithSafety(db)).map((child) => [child.id, childDisplayName(child)]),
  );

  return (
    <>
      <PageHeader title={t.reports.title} />

      {canWrite ? (
        <DailyReportForm
          tenantSlug={tenantSlug}
          today={today}
          childrenOptions={children.map((child) => ({
            id: child.id,
            name: childDisplayName(child),
          }))}
        />
      ) : null}

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={t.reports.noReports}
          description={t.reports.noReportsBody}
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const meals = (Array.isArray(report.meals) ? report.meals : []) as Meal[];

            return (
              <li key={report.id}>
                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle>
                        {childNames.get(report.child_id) ?? t.children.title}
                      </CardTitle>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {formatDate(report.report_date, ctx.tenant.locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.mood ? (
                        <Badge variant="secondary">{t.reports.moods[report.mood]}</Badge>
                      ) : null}
                      <Badge variant={report.is_published ? "success" : "muted"}>
                        {report.is_published ? t.reports.published : t.reports.draft}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    {meals.length > 0 ? (
                      <p>
                        <span className="font-medium">{t.reports.meals}: </span>
                        {meals
                          .map(
                            (meal) =>
                              `${
                                t.reports.mealTypes[
                                  meal.type as keyof typeof t.reports.mealTypes
                                ] ?? meal.type
                              } — ${
                                t.reports.mealAmounts[
                                  meal.amount as keyof typeof t.reports.mealAmounts
                                ] ?? meal.amount
                              }`,
                          )
                          .join(", ")}
                      </p>
                    ) : null}

                    {report.activities ? (
                      <p>
                        <span className="font-medium">{t.reports.activities}: </span>
                        {report.activities}
                      </p>
                    ) : null}

                    {report.notes ? (
                      <p className="whitespace-pre-wrap text-[var(--muted-foreground)]">
                        {report.notes}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

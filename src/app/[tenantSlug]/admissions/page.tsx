import { redirect } from "next/navigation";
import { Inbox, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listClasses } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";
import { getTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { reviewApplication } from "./actions";
import type { AllergyInput } from "@/lib/validation/schemas";
import type { ApplicationRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Admissions" };

export default async function AdmissionsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  if (!can(ctx.role, "admissions.view")) redirect(`/${tenantSlug}`);

  if (!ctx.activeYear) {
    return (
      <>
        <PageHeader title={t.admissions.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const canManage = can(ctx.role, "admissions.manage") && ctx.canWrite;

  const [{ data }, classes] = await Promise.all([
    db
      .selectForYear("applications", ctx.activeYear.id)
      .order("created_at", { ascending: false }),
    listClasses(db, ctx.activeYear.id),
  ]);

  const applications = (data ?? []) as ApplicationRow[];
  const pending = applications.filter((app) => app.status === "pending");
  const others = applications.filter((app) => app.status !== "pending");
  const applyUrl = `${publicEnv.appUrl.replace(/\/$/, "")}/apply/${tenantSlug}`;

  async function decide(formData: FormData) {
    "use server";
    await reviewApplication(tenantSlug, {
      applicationId: String(formData.get("applicationId") ?? ""),
      decision: (formData.get("decision") as "approved") ?? "waitlisted",
      classId: String(formData.get("classId") ?? ""),
      reviewNotes: "",
    });
  }

  return (
    <>
      <PageHeader title={t.admissions.title} description={ctx.activeYear.name} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" aria-hidden />
            {t.admissions.shareLink}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <code className="block truncate rounded-lg bg-[var(--muted)] px-3 py-2 text-sm">
            {applyUrl}
          </code>
        </CardContent>
      </Card>

      {applications.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={t.admissions.noApplications}
          description={t.admissions.noApplicationsBody}
        />
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {t.admissions.applications}
              </h2>
              {pending.map((application) => {
                const allergies = (
                  Array.isArray(application.allergies) ? application.allergies : []
                ) as AllergyInput[];

                return (
                  <Card key={application.id}>
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                      <div>
                        <CardTitle>
                          {application.child_first_name} {application.child_last_name}
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {formatDate(application.date_of_birth, ctx.tenant.locale)} ·{" "}
                          {application.parent_name} · {application.parent_phone}
                        </p>
                      </div>
                      <Badge variant="warning">{t.admissions.statuses.pending}</Badge>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {allergies.length > 0 ? (
                        <div className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_35%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_8%,var(--card))] p-3 text-sm">
                          <p className="font-semibold">{t.allergies.title}</p>
                          <ul className="mt-1 space-y-1">
                            {allergies.map((allergy, index) => (
                              <li key={index}>
                                <span className="font-medium">{allergy.allergen}</span> (
                                {t.allergies.severities[allergy.severity]}) — {allergy.reaction}.{" "}
                                {allergy.requiredAction}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {application.message ? (
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {application.message}
                        </p>
                      ) : null}

                      {canManage ? (
                        <form action={decide} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="applicationId" value={application.id} />
                          <label className="text-sm">
                            <span className="mb-1 block font-medium">{t.classes.title}</span>
                            <Select name="classId" defaultValue="" className="w-48">
                              <option value="">{t.common.notSet}</option>
                              {classes.map((klass) => (
                                <option key={klass.id} value={klass.id}>
                                  {klass.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <Button type="submit" name="decision" value="approved">
                            {t.admissions.approve}
                          </Button>
                          <Button
                            type="submit"
                            name="decision"
                            value="waitlisted"
                            variant="secondary"
                          >
                            {t.admissions.waitlistAction}
                          </Button>
                          <Button
                            type="submit"
                            name="decision"
                            value="rejected"
                            variant="ghost"
                          >
                            {t.admissions.reject}
                          </Button>
                        </form>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ) : null}

          {others.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.admissions.applications}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {others.map((application) => (
                    <li
                      key={application.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3 text-sm"
                    >
                      <span>
                        {application.child_first_name} {application.child_last_name}
                      </span>
                      <Badge
                        variant={
                          application.status === "approved"
                            ? "success"
                            : application.status === "waitlisted"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {t.admissions.statuses[application.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}

import { HeartPulse } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatDateTime } from "@/lib/utils";
import { logIncident } from "./actions";
import type { IncidentRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Health & incidents" };

export default async function HealthPage({
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
        <PageHeader title={t.health.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const canWrite = can(ctx.role, "incidents.write") && ctx.canWrite;

  const [{ data }, children] = await Promise.all([
    db
      .selectForYear("incidents", ctx.activeYear.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    listChildrenWithSafety(db),
  ]);

  const incidents = (data ?? []) as IncidentRow[];
  const childNames = new Map(children.map((child) => [child.id, childDisplayName(child)]));

  async function submit(formData: FormData) {
    "use server";
    await logIncident(tenantSlug, {
      childId: String(formData.get("childId") ?? ""),
      incidentType: (formData.get("incidentType") as "injury") ?? "injury",
      occurredAt: String(formData.get("occurredAt") ?? ""),
      location: String(formData.get("location") ?? ""),
      description: String(formData.get("description") ?? ""),
      actionTaken: String(formData.get("actionTaken") ?? ""),
      medicationName: String(formData.get("medicationName") ?? ""),
      medicationDose: String(formData.get("medicationDose") ?? ""),
      witness: String(formData.get("witness") ?? ""),
      notifyParent: formData.get("notifyParent") !== null,
    });
  }

  return (
    <>
      <PageHeader title={t.health.title} />

      {canWrite && children.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.health.logIncident}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t.children.title} htmlFor="incident-child">
                  <Select id="incident-child" name="childId" required>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {childDisplayName(child)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.health.incidentType} htmlFor="incident-type">
                  <Select id="incident-type" name="incidentType" defaultValue="injury">
                    <option value="injury">{t.health.types.injury}</option>
                    <option value="illness">{t.health.types.illness}</option>
                    <option value="medication">{t.health.types.medication}</option>
                    <option value="behaviour">{t.health.types.behaviour}</option>
                    <option value="other">{t.health.types.other}</option>
                  </Select>
                </Field>
                <Field label={t.health.occurredAt} htmlFor="incident-when">
                  <Input id="incident-when" name="occurredAt" type="datetime-local" required />
                </Field>
                <Field label={t.health.location} hint={t.common.optional} htmlFor="incident-where">
                  <Input id="incident-where" name="location" />
                </Field>
              </div>

              <Field label={t.health.description} htmlFor="incident-what">
                <Textarea id="incident-what" name="description" required rows={2} />
              </Field>

              <Field label={t.health.actionTaken} htmlFor="incident-action">
                <Textarea id="incident-action" name="actionTaken" required rows={2} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t.allergies.medication} hint={t.common.optional} htmlFor="med-name">
                  <Input id="med-name" name="medicationName" />
                </Field>
                <Field label={t.finance.amount} hint={t.common.optional} htmlFor="med-dose">
                  <Input id="med-dose" name="medicationDose" />
                </Field>
                <Field label={t.health.witness} hint={t.common.optional} htmlFor="witness">
                  <Input id="witness" name="witness" />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notifyParent" defaultChecked className="size-4" />
                {t.health.notifyParent}
              </label>

              <Button type="submit">{t.health.logIncident}</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {incidents.length === 0 ? (
        <EmptyState
          icon={<HeartPulse />}
          title={t.health.noIncidents}
          description={t.health.noIncidentsBody}
        />
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>
                      {childNames.get(incident.child_id) ?? t.children.title}
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {formatDateTime(
                        incident.occurred_at,
                        ctx.tenant.locale,
                        ctx.tenant.timezone,
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={
                        incident.incident_type === "injury" ? "destructive" : "secondary"
                      }
                    >
                      {t.health.types[incident.incident_type]}
                    </Badge>
                    {incident.parent_notified_at ? (
                      <Badge variant="success">{t.health.parentNotified}</Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>{incident.description}</p>
                  <p className="text-[var(--muted-foreground)]">
                    <span className="font-medium">{t.health.actionTaken}: </span>
                    {incident.action_taken}
                  </p>
                  {incident.medication_name ? (
                    <p className="text-[var(--muted-foreground)]">
                      {incident.medication_name}
                      {incident.medication_dose ? ` · ${incident.medication_dose}` : ""}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import { GraduationCap } from "lucide-react";

import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassForm } from "@/components/classes/class-form";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listClasses, listStaff } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import type { ClassTeacherRow, EnrollmentRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Classes" };

export default async function ClassesPage({
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
        <PageHeader title={t.classes.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const canManage = can(ctx.role, "classes.manage") && ctx.canWrite;

  const [classes, staff, teacherLinksResult, enrolmentsResult] = await Promise.all([
    listClasses(db, ctx.activeYear.id),
    canManage ? listStaff(db) : Promise.resolve([]),
    db.select("class_teachers"),
    db.selectForYear("enrollments", ctx.activeYear.id, "class_id, status"),
  ]);

  const teacherLinks = (teacherLinksResult.data ?? []) as ClassTeacherRow[];
  const enrolments = (enrolmentsResult.data ?? []) as Pick<
    EnrollmentRow,
    "class_id" | "status"
  >[];

  const staffById = new Map(staff.map((member) => [member.id, member]));

  return (
    <>
      <PageHeader
        title={t.classes.title}
        description={`${ctx.activeYear.name} · ${classes.length}`}
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={t.classes.noClasses}
          description={t.classes.noClassesBody}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass) => {
            const enrolled = enrolments.filter(
              (enrolment) => enrolment.class_id === klass.id && enrolment.status === "active",
            ).length;
            const teachers = teacherLinks
              .filter((link) => link.class_id === klass.id)
              .map((link) => staffById.get(link.profile_id))
              .filter(Boolean);
            const spacesLeft = Math.max(0, klass.capacity - enrolled);

            return (
              <li key={klass.id}>
                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{klass.name}</CardTitle>
                      {klass.room ? (
                        <p className="text-xs text-[var(--muted-foreground)]">{klass.room}</p>
                      ) : null}
                    </div>
                    <Badge variant={spacesLeft === 0 ? "warning" : "muted"}>
                      {spacesLeft === 0
                        ? t.classes.full
                        : t.classes.spacesLeft.replace("{count}", String(spacesLeft))}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>{t.classes.enrolled.replace("{count}", String(enrolled))}</p>
                    {teachers.length > 0 ? (
                      <p className="text-[var(--muted-foreground)]">
                        {t.classes.teachers}:{" "}
                        {teachers.map((teacher) => teacher!.full_name ?? teacher!.email).join(", ")}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {canManage ? (
        <ClassForm
          tenantSlug={tenantSlug}
          teachers={staff
            .filter((member) => member.role === "teacher" || member.role === "admin")
            .map((member) => ({ id: member.id, name: member.full_name ?? member.email }))}
        />
      ) : null}
    </>
  );
}

import { redirect } from "next/navigation";

import { ChildForm } from "@/components/children/child-form";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listClasses } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";

export const metadata = { title: "Add child" };

export default async function NewChildPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);

  if (!can(ctx.role, "children.manage")) redirect(`/${tenantSlug}/children`);

  if (!ctx.canWrite) {
    return (
      <>
        <PageHeader title={t.children.addChild} />
        <Alert role="alert" tone="warning" title={t.subscription.readOnlyTitle}>
          {t.subscription.readOnlyBody}
        </Alert>
      </>
    );
  }

  if (!ctx.activeYear) {
    return (
      <>
        <PageHeader title={t.children.addChild} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const classes = await listClasses(scoped(ctx), ctx.activeYear.id);

  return (
    <>
      <PageHeader title={t.children.addChild} description={ctx.activeYear.name} />
      <ChildForm
        tenantSlug={tenantSlug}
        classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
      />
    </>
  );
}

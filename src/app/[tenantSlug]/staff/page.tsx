import { redirect } from "next/navigation";
import { Clock, UserRoundPlus } from "lucide-react";

import { InviteParentForm, InviteStaffForm } from "@/components/staff/invite-forms";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety, listClasses, listStaff } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatDate, initials } from "@/lib/utils";
import type { InvitationRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Staff" };

export default async function StaffPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  if (!can(ctx.role, "staff.view")) redirect(`/${tenantSlug}`);

  const canInviteStaff = can(ctx.role, "invites.staff") && ctx.canWrite;
  const canInviteParents = can(ctx.role, "invites.parents") && ctx.canWrite;

  const [staff, invitesResult, classes, children] = await Promise.all([
    listStaff(db),
    db
      .select("invitations")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    ctx.activeYear ? listClasses(db, ctx.activeYear.id) : Promise.resolve([]),
    canInviteParents ? listChildrenWithSafety(db) : Promise.resolve([]),
  ]);

  const invites = (invitesResult.data ?? []) as InvitationRow[];

  return (
    <>
      <PageHeader title={t.staff.title} description={`${staff.length}`} />

      {!ctx.canWrite ? (
        <Alert tone="warning" title={t.subscription.readOnlyTitle}>
          {t.subscription.readOnlyBody}
        </Alert>
      ) : null}

      {staff.length === 0 ? (
        <EmptyState
          icon={<UserRoundPlus />}
          title={t.staff.noStaff}
          description={t.staff.noStaffBody}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.staff.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {staff.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-medium text-[var(--muted-foreground)]">
                    {initials(member.full_name ?? member.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.full_name ?? member.email}</p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{t.staff.roles[member.role]}</Badge>
                    {!member.is_active ? (
                      <Badge variant="muted">{t.staff.deactivated}</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" aria-hidden />
              {t.staff.pendingInvites}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{invite.email}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {t.staff.roles[invite.role]} ·{" "}
                      {formatDate(invite.expires_at, ctx.tenant.locale)}
                    </p>
                  </div>
                  <Badge variant="warning">{t.staff.invited}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canInviteStaff ? (
        <InviteStaffForm
          tenantSlug={tenantSlug}
          classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
        />
      ) : null}

      {canInviteParents ? (
        <InviteParentForm
          tenantSlug={tenantSlug}
          childrenOptions={children.map((child) => ({
            id: child.id,
            name: childDisplayName(child),
          }))}
        />
      ) : null}
    </>
  );
}

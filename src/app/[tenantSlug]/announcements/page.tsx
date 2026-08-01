import { Megaphone, Pin } from "lucide-react";

import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { classesForUser } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { AnnouncementRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  const canPost =
    canAny(ctx.role, ["announcements.post_school", "announcements.post_class"]) && ctx.canWrite;

  // RLS decides visibility: parents see school-wide plus their own child's
  // class, staff see everything including staff-only notices.
  const { data } = ctx.activeYear
    ? await db
        .selectForYear("announcements", ctx.activeYear.id)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false })
    : { data: [] };

  const announcements = (data ?? []) as AnnouncementRow[];
  const classes =
    canPost && ctx.activeYear
      ? await classesForUser(db, ctx.activeYear.id, ctx.profile.id, ctx.role)
      : [];

  return (
    <>
      <PageHeader title={t.announcements.title} />

      {canPost && ctx.activeYear ? (
        <AnnouncementForm
          tenantSlug={tenantSlug}
          role={ctx.role}
          classes={classes.map((klass) => ({ id: klass.id, name: klass.name }))}
        />
      ) : null}

      {announcements.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={t.announcements.noAnnouncements}
          description={t.announcements.noAnnouncementsBody}
        />
      ) : (
        <ul className="space-y-3">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {announcement.is_pinned ? (
                        <Pin className="size-4 text-[var(--primary)]" aria-hidden />
                      ) : null}
                      {announcement.title}
                    </CardTitle>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {formatDate(announcement.published_at, ctx.tenant.locale)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {t.announcements.audiences[announcement.audience]}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

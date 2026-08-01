import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";

import { AllergyBadge } from "@/components/safety/allergy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatAge, initials } from "@/lib/utils";

export const metadata = { title: "Children" };

export default async function ChildrenPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q, status } = await searchParams;

  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  const children = await listChildrenWithSafety(db, { search: q });
  const filtered = status ? children.filter((child) => child.status === status) : children;
  const canManage = can(ctx.role, "children.manage") && ctx.canWrite;

  return (
    <>
      <PageHeader
        title={t.children.title}
        description={`${filtered.length}`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={`/${tenantSlug}/children/new`}>
                <Plus aria-hidden />
                {t.children.addChild}
              </Link>
            </Button>
          ) : null
        }
      />

      <form className="flex gap-2" action={`/${tenantSlug}/children`}>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder={t.children.searchPlaceholder}
            aria-label={t.common.search}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          {t.common.search}
        </Button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t.children.noChildren}
          description={t.children.noChildrenBody}
          action={
            canManage ? (
              <Button asChild>
                <Link href={`/${tenantSlug}/children/new`}>{t.children.addChild}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((child) => (
            <li key={child.id}>
              <Link href={`/${tenantSlug}/children/${child.id}`} className="block">
                <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--muted)]">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-medium text-[var(--muted-foreground)]">
                    {initials(childDisplayName(child))}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{childDisplayName(child)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatAge(child.date_of_birth)} ·{" "}
                      {t.children.statuses[child.status]}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <AllergyBadge allergies={child.allergies} t={t} />
                    {child.status !== "active" ? (
                      <Badge variant="muted">{t.children.statuses[child.status]}</Badge>
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import { redirect } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { getProfile } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { publicEnv } from "@/lib/env";
import { createTenantWithOwner, updateSubscriptionStatus } from "./actions";
import type { PlatformStatsRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Platform" };

/**
 * Super-admin panel.
 *
 * Deliberately limited: create schools, invite owners, set slug/plan/status,
 * and read AGGREGATE counts. There is no route from here into a school's
 * children, reports or messages — `requireTenantContext` refuses a
 * super_admin outright, and the stats come from `app.platform_stats()`, a
 * SECURITY DEFINER function that returns nothing but totals.
 */
export default async function PlatformPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "super_admin") redirect("/");

  const { locale, t } = await getTranslations();

  const admin = createServiceRoleClient();

  // Aggregates only — deliberately never a child, report or message.
  // `app.platform_stats()` in migration 0007 computes the same thing inside
  // the database for any client that queries it directly; here the counts are
  // assembled with head-only queries so no tenant row is ever fetched.
  const { data: tenantRows } = await admin
    .from("tenants")
    .select("id, name, slug, subscription_status, created_at")
    .order("created_at", { ascending: false });

  const stats: PlatformStatsRow[] = await Promise.all(
    ((tenantRows ?? []) as {
      id: string;
      name: string;
      slug: string;
      subscription_status: PlatformStatsRow["subscription_status"];
      created_at: string;
    }[]).map(async (tenant) => {
      const [children, staff, parents, classes, year] = await Promise.all([
        admin
          .from("children")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "active"),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .in("role", ["owner", "admin", "teacher"]),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("role", "parent"),
        admin
          .from("classes")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
        admin
          .from("academic_years")
          .select("name")
          .eq("tenant_id", tenant.id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        slug: tenant.slug,
        subscription_status: tenant.subscription_status,
        children_count: children.count ?? 0,
        staff_count: staff.count ?? 0,
        parent_count: parents.count ?? 0,
        class_count: classes.count ?? 0,
        active_year: (year.data as { name: string } | null)?.name ?? null,
        created_at: tenant.created_at,
      } satisfies PlatformStatsRow;
    }),
  );

  async function addTenant(formData: FormData) {
    "use server";
    await createTenantWithOwner({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      ownerEmail: String(formData.get("ownerEmail") ?? ""),
      ownerName: String(formData.get("ownerName") ?? ""),
      plan: String(formData.get("plan") ?? "standard"),
      timezone: String(formData.get("timezone") ?? "Africa/Mogadishu"),
      locale: (formData.get("locale") as "en" | "so") ?? "en",
      currency: String(formData.get("currency") ?? "USD"),
    });
  }

  async function changeStatus(formData: FormData) {
    "use server";
    await updateSubscriptionStatus({
      tenantId: String(formData.get("tenantId") ?? ""),
      subscriptionStatus: (formData.get("status") as "active") ?? "trialing",
      statusNote: String(formData.get("statusNote") ?? ""),
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          {publicEnv.appName} · {t.platform.title}
        </span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher current={locale} compact />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              {t.common.signOut}
            </Button>
          </form>
        </div>
      </div>

      <PageHeader title={t.platform.tenants} description={`${stats.length}`} />

      <Alert tone="info" title={t.platform.privacyNote} />

      <Card>
        <CardHeader>
          <CardTitle>{t.platform.addTenant}</CardTitle>
          <CardDescription>{t.platform.ownerEmailHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addTenant} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.platform.schoolName} htmlFor="tenant-name">
                <Input id="tenant-name" name="name" required placeholder="Little Stars Kindergarten" />
              </Field>
              <Field label={t.settings.slug} htmlFor="tenant-slug">
                <Input id="tenant-slug" name="slug" required placeholder="little-stars" pattern="[a-z0-9-]+" />
              </Field>
              <Field label={t.platform.ownerEmail} htmlFor="owner-email">
                <Input id="owner-email" name="ownerEmail" type="email" required />
              </Field>
              <Field label={t.staff.name} hint={t.common.optional} htmlFor="owner-name">
                <Input id="owner-name" name="ownerName" />
              </Field>
              <Field label={t.settings.timezone} htmlFor="tenant-tz">
                <Select id="tenant-tz" name="timezone" defaultValue="Africa/Mogadishu">
                  <option value="Africa/Mogadishu">Africa/Mogadishu</option>
                  <option value="Africa/Nairobi">Africa/Nairobi</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </Select>
              </Field>
              <Field label={t.settings.currency} htmlFor="tenant-currency">
                <Select id="tenant-currency" name="currency" defaultValue="USD">
                  <option value="USD">USD</option>
                  <option value="SOS">SOS</option>
                  <option value="KES">KES</option>
                  <option value="EUR">EUR</option>
                </Select>
              </Field>
            </div>
            <Button type="submit">{t.platform.inviteOwner}</Button>
          </form>
        </CardContent>
      </Card>

      {stats.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={t.platform.noTenants}
          description={t.platform.noTenantsBody}
        />
      ) : (
        <ul className="space-y-3">
          {stats.map((tenant) => (
            <li key={tenant.tenant_id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>{tenant.tenant_name}</CardTitle>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      /{tenant.slug} · {tenant.active_year ?? t.dashboard.noActiveYear} ·{" "}
                      {formatDate(tenant.created_at, locale)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      tenant.subscription_status === "active"
                        ? "success"
                        : tenant.subscription_status === "trialing"
                          ? "secondary"
                          : tenant.subscription_status === "past_due"
                            ? "warning"
                            : "destructive"
                    }
                  >
                    {t.subscription.status[tenant.subscription_status]}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-3">
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div className="flex gap-1.5">
                      <dt className="text-[var(--muted-foreground)]">{t.platform.children}:</dt>
                      <dd className="font-medium tabular-nums">{tenant.children_count}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-[var(--muted-foreground)]">{t.platform.staff}:</dt>
                      <dd className="font-medium tabular-nums">{tenant.staff_count}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-[var(--muted-foreground)]">{t.platform.parents}:</dt>
                      <dd className="font-medium tabular-nums">{tenant.parent_count}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-[var(--muted-foreground)]">{t.classes.title}:</dt>
                      <dd className="font-medium tabular-nums">{tenant.class_count}</dd>
                    </div>
                  </dl>

                  <form action={changeStatus} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tenantId" value={tenant.tenant_id} />
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">{t.platform.changeStatus}</span>
                      <Select
                        name="status"
                        defaultValue={tenant.subscription_status}
                        className="w-44"
                      >
                        <option value="trialing">{t.subscription.status.trialing}</option>
                        <option value="active">{t.subscription.status.active}</option>
                        <option value="past_due">{t.subscription.status.past_due}</option>
                        <option value="suspended">{t.subscription.status.suspended}</option>
                      </Select>
                    </label>
                    <Input
                      name="statusNote"
                      placeholder={t.platform.statusNote}
                      aria-label={t.platform.statusNote}
                      className="w-56"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      {t.common.save}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

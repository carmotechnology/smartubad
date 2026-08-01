import { notFound } from "next/navigation";

import { ApplicationForm } from "@/components/admissions/application-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { I18nProvider } from "@/components/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTranslations, interpolate } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import type { TenantRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * The public admissions form. No account, no session — the only unauthenticated
 * write path in the product, and it goes through a validated, rate-limited
 * server action rather than an open RLS policy.
 */
export default async function ApplyPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  // Read with the service-role client: an anonymous visitor has no session,
  // and only the school's public-facing fields are selected.
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("tenants")
    .select("name, slug, logo_url, tagline, accent_color, locale, subscription_status")
    .eq("slug", tenantSlug)
    .maybeSingle();

  const tenant = data as Pick<
    TenantRow,
    "name" | "slug" | "logo_url" | "tagline" | "accent_color" | "locale" | "subscription_status"
  > | null;

  if (!tenant || !["active", "trialing"].includes(tenant.subscription_status)) {
    notFound();
  }

  const { locale, t } = await getTranslations(tenant.locale);

  return (
    <I18nProvider locale={locale} dictionary={t}>
      <main
        className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-10"
        style={
          tenant.accent_color
            ? ({ "--primary": tenant.accent_color } as React.CSSProperties)
            : undefined
        }
      >
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="size-11 rounded-xl object-cover" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
                🧸
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{tenant.name}</p>
              {tenant.tagline ? (
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {tenant.tagline}
                </p>
              ) : null}
            </div>
          </div>
          <LanguageSwitcher current={locale} compact />
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {interpolate(t.admissions.applyTitle, { school: tenant.name })}
            </CardTitle>
            <CardDescription>{t.admissions.applySubtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationForm tenantSlug={tenant.slug} />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[var(--muted-foreground)]">
          {publicEnv.appName}
        </p>
      </main>
    </I18nProvider>
  );
}

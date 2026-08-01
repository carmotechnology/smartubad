import { notFound, redirect } from "next/navigation";

import { AppShell, SubscriptionBanner } from "@/components/app-shell/sidebar";
import { I18nProvider } from "@/components/i18n-provider";
import { requireTenantContext } from "@/lib/auth/session";
import {
  ForbiddenError,
  TenantNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { getTranslations } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return { title: { default: publicEnv.appName, template: `%s · ${tenantSlug}` } };
}

/**
 * The tenant workspace shell.
 *
 * `requireTenantContext` resolves identity from the session and checks it
 * against the slug in the URL. Editing the slug in the address bar therefore
 * lands on "not found", never on another school's data — and even if this
 * check were removed, RLS would still return zero rows.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  let ctx;
  try {
    ctx = await requireTenantContext(tenantSlug);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=/${tenantSlug}`);
    }
    if (error instanceof TenantNotFoundError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      // A super-admin, or an account with no school. Send them somewhere real
      // rather than showing a dead end.
      redirect("/login?error=no_profile");
    }
    throw error;
  }

  const { locale, t } = await getTranslations(ctx.tenant.locale);

  return (
    <I18nProvider locale={locale} dictionary={t}>
      <div
        // A tenant's accent colour overrides the default for its whole
        // workspace — branding without a rebuild or a per-tenant stylesheet.
        style={
          ctx.tenant.accent_color
            ? ({ "--primary": ctx.tenant.accent_color, "--ring": ctx.tenant.accent_color } as React.CSSProperties)
            : undefined
        }
      >
        <AppShell
          locale={locale}
          tenant={{
            name: ctx.tenant.name,
            slug: ctx.tenant.slug,
            logoUrl: ctx.tenant.logo_url,
            subscriptionStatus: ctx.tenant.subscription_status,
          }}
          user={{
            name: ctx.profile.full_name ?? ctx.profile.email,
            email: ctx.profile.email,
            role: ctx.role,
            avatarUrl: ctx.profile.avatar_url,
          }}
          banner={
            <SubscriptionBanner
              status={ctx.tenant.subscription_status}
              title={t.subscription.readOnlyTitle}
              body={t.subscription.readOnlyBody}
              contact={t.subscription.contactAdmin}
            />
          }
        >
          {children}
        </AppShell>
      </div>
    </I18nProvider>
  );
}

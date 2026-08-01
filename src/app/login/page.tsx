import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { SignInPanel } from "@/components/auth/sign-in-panel";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Alert } from "@/components/ui/feedback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { getTranslations } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, keyof typeof errorKeys> = {
  no_profile: "noProfile",
  invite_invalid: "inviteInvalid",
  invite_expired: "inviteExpired",
  invite_used: "inviteUsed",
  invite_revoked: "inviteRevoked",
  email_mismatch: "emailMismatch",
  oauth_failed: "oauthFailed",
};

const errorKeys = {
  noProfile: true,
  inviteInvalid: true,
  inviteExpired: true,
  inviteUsed: true,
  inviteRevoked: true,
  emailMismatch: true,
  oauthFailed: true,
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; invited?: string; actual?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslations();

  // Already signed in and provisioned? Go where you belong.
  const user = await getAuthUser();
  if (user) {
    const profile = await getProfile();
    if (profile?.role === "super_admin") redirect("/platform");
    if (profile?.tenant_id) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      const tenant = data as Pick<TenantRow, "slug"> | null;
      if (tenant) redirect(`/${tenant.slug}`);
    }
  }

  const errorKey = params.error ? ERROR_MESSAGES[params.error] : undefined;

  const errorText: Record<string, { title: string; body: string }> = {
    noProfile: {
      title: t.auth.noAccount,
      body: t.auth.noAccountHelp,
    },
    inviteInvalid: { title: t.invite.invalidTitle, body: t.invite.invalidBody },
    inviteExpired: { title: t.invite.expiredTitle, body: t.invite.expiredBody },
    inviteUsed: { title: t.invite.usedTitle, body: t.invite.usedBody },
    inviteRevoked: { title: t.invite.revokedTitle, body: t.invite.revokedBody },
    emailMismatch: {
      title: t.invite.mismatchTitle,
      body: t.invite.mismatchBody
        .replace("{invited}", params.invited ?? "the invited address")
        .replace("{actual}", params.actual ?? "another account"),
    },
    oauthFailed: { title: t.auth.errorGeneric, body: "" },
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            🧸
          </span>
          {publicEnv.appName}
        </Link>
        <LanguageSwitcher current={locale} compact />
      </div>

      {errorKey ? (
        <Alert
          role="alert"
          tone={errorKey === "emailMismatch" ? "danger" : "warning"}
          icon={<AlertCircle />}
          title={errorText[errorKey].title}
        >
          {errorText[errorKey].body}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.auth.welcome}</CardTitle>
          <CardDescription>{t.auth.signInSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInPanel t={t} redirectTo={params.next ?? "/"} />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        {t.auth.noAccountHelp}
      </p>
    </main>
  );
}

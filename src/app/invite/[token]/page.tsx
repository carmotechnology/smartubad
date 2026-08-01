import Link from "next/link";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";

import { SignInPanel } from "@/components/auth/sign-in-panel";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findInvitationByToken } from "@/lib/auth/invites";
import { publicEnv } from "@/lib/env";
import { getTranslations, interpolate } from "@/lib/i18n";
import { relativeDeadline } from "@/lib/utils";

export const metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

/**
 * The invitation landing page.
 *
 * It shows only what the recipient already knows — their own email and the
 * school's name — and never the token hash or anything about other members.
 * Accepting happens in `/auth/callback`, which is where the email match is
 * enforced; this page cannot grant access on its own.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { locale, t } = await getTranslations();
  const lookup = await findInvitationByToken(token);

  if (!lookup.ok) {
    const copy = {
      not_found: { title: t.invite.invalidTitle, body: t.invite.invalidBody },
      expired: { title: t.invite.expiredTitle, body: t.invite.expiredBody },
      used: { title: t.invite.usedTitle, body: t.invite.usedBody },
      revoked: { title: t.invite.revokedTitle, body: t.invite.revokedBody },
    }[lookup.reason];

    return (
      <Shell locale={locale}>
        <Alert role="alert" tone="warning" icon={<AlertTriangle />} title={copy.title}>
          {copy.body}
        </Alert>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/login">{t.common.signIn}</Link>
        </Button>
      </Shell>
    );
  }

  const { invitation } = lookup;
  const roleLabel = t.invite.roles[invitation.role];

  return (
    <Shell locale={locale}>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-foreground)]">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-lg">{t.invite.title}</CardTitle>
          <CardDescription>
            {interpolate(t.invite.joinAs, {
              school: invitation.tenant.name,
              role: roleLabel,
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {invitation.message ? (
            <blockquote className="rounded-lg border-l-2 border-[var(--primary)] bg-[var(--muted)] px-4 py-3 text-sm italic">
              {invitation.message}
            </blockquote>
          ) : null}

          <Alert tone="info" title={interpolate(t.invite.boundTo, { email: invitation.email })}>
            {t.invite.mustMatch}
          </Alert>

          <SignInPanel
            t={t}
            inviteToken={token}
            lockedEmail={invitation.email}
            redirectTo={`/${invitation.tenant.slug}`}
          />

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--muted-foreground)]">
            <Clock className="size-3.5" aria-hidden />
            {interpolate(t.invite.expiresIn, {
              when: relativeDeadline(invitation.expires_at, locale),
            })}
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({
  locale,
  children,
}: {
  locale: "en" | "so";
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            🧸
          </span>
          {publicEnv.appName}
        </span>
        <LanguageSwitcher current={locale} compact />
      </div>
      {children}
    </main>
  );
}

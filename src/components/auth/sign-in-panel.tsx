"use client";

import * as React from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/**
 * Google OAuth first, magic link as the fallback.
 *
 * `lockedEmail` is set on the invite screen: the address is fixed by the
 * invitation, so the magic-link field is read-only and `login_hint` nudges
 * Google to offer the right account. The real check still happens server-side
 * in the callback — a hint is a convenience, never a control.
 */
export function SignInPanel({
  t,
  redirectTo = "/",
  inviteToken,
  lockedEmail,
}: {
  t: Dictionary;
  redirectTo?: string;
  inviteToken?: string;
  lockedEmail?: string;
}) {
  const [email, setEmail] = React.useState(lockedEmail ?? "");
  const [pending, setPending] = React.useState<"google" | "magic" | null>(null);
  const [magicSent, setMagicSent] = React.useState(false);

  function callbackUrl() {
    const url = new URL("/auth/callback", publicEnv.appUrl);
    url.searchParams.set("next", redirectTo);
    if (inviteToken) url.searchParams.set("invite", inviteToken);
    return url.toString();
  }

  async function signInWithGoogle() {
    setPending("google");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl(),
          queryParams: {
            // Force the account chooser so someone already signed into the
            // wrong Google account is not silently bounced for a mismatch.
            prompt: lockedEmail ? "select_account" : "consent",
            ...(lockedEmail ? { login_hint: lockedEmail } : {}),
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      toast.error(t.auth.errorGeneric);
      setPending(null);
    }
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const address = (lockedEmail ?? email).trim().toLowerCase();
    if (!address) return;

    setPending("magic");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          emailRedirectTo: callbackUrl(),
          // Never let a magic link mint a brand-new account: users exist only
          // through invitations. An uninvited address simply gets nothing.
          shouldCreateUser: Boolean(inviteToken),
        },
      });
      if (error) throw error;
      setMagicSent(true);
      toast.success(t.auth.magicLinkSent);
    } catch (error) {
      console.error(error);
      toast.error(t.auth.errorGeneric);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <Button
        type="button"
        size="touch"
        variant="outline"
        onClick={signInWithGoogle}
        disabled={pending !== null}
        className="gap-3"
      >
        <GoogleMark />
        {pending === "google" ? t.auth.signingIn : t.auth.continueWithGoogle}
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          {t.auth.orDivider}
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {magicSent ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-center text-sm">
          <Mail className="mx-auto mb-2 size-5 text-[var(--muted-foreground)]" aria-hidden />
          {t.auth.magicLinkSent}
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <Field label={t.auth.emailLabel} htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              readOnly={Boolean(lockedEmail)}
              value={lockedEmail ?? email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={lockedEmail ? "bg-[var(--muted)]" : undefined}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={pending !== null}
          >
            {pending === "magic" ? t.common.saving : t.auth.magicLinkCta}
          </Button>
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            {t.auth.magicLinkHint}
          </p>
        </form>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.71v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.71a11.5 11.5 0 0 0 0 10.32l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.9c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.46 15.11.5 12 .5A11.5 11.5 0 0 0 1.71 6.84l3.84 2.98C6.46 7.1 9 4.9 12 4.9Z"
      />
    </svg>
  );
}

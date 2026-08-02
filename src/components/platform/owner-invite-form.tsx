"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";
import { resendOwnerInvite } from "@/app/platform/actions";

/**
 * Invite (or re-invite) the owner of an existing school.
 *
 * This is a client component specifically so it can show the result. The
 * invitation URL is displayed back after sending, because email delivery is
 * not guaranteed — an unverified Resend domain, a bounced address or a
 * provider outage would otherwise leave the operator with an invitation that
 * exists in the database and a link nobody can reach.
 *
 * Showing the link is not a weakening of the model: it is still bound to the
 * invited email, single-use and expiring, so passing it on by hand grants no
 * more access than the email would have.
 */
export function OwnerInviteForm({
  tenantId,
  label,
  helpText,
  emailLabel,
}: {
  tenantId: string;
  label: string;
  helpText: string;
  emailLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("ownerEmail") ?? "").trim();
    if (!email) return;

    setPending(true);
    setError(null);
    setInviteUrl(null);
    setCopied(false);

    const result = await resendOwnerInvite(tenantId, email);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setInviteUrl(result.data?.inviteUrl ?? null);
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{label}</span>
          <Input
            name="ownerEmail"
            type="email"
            required
            placeholder="owner@example.com"
            aria-label={emailLabel}
            className="w-72"
          />
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <Send aria-hidden />
          {pending ? "Sending…" : label}
        </Button>
      </form>

      <p className="text-xs text-[var(--muted-foreground)]">{helpText}</p>

      {error ? <Alert role="alert" tone="danger" title={error} /> : null}

      {inviteUrl ? (
        <Alert tone="success" title="Invitation created">
          <p className="mb-2">
            Send this link to the owner if the email does not arrive. It expires
            in 72 hours, can be used once, and only works for the address it was
            issued to.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1 text-xs">
              {inviteUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}

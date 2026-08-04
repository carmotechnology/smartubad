import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import type { InvitationRow, TenantRow, UserRole } from "@/lib/supabase/database.types";

/**
 * Email-bound, single-use, expiring invitations.
 *
 * The security properties that matter, and where each one lives:
 *
 *  1. The raw token exists only in the email. The database stores SHA-256 of
 *     it, so a database leak yields no usable invite links.  -> hashToken()
 *  2. The token is bound to an email + tenant + role at creation.
 *     -> createInvitation()
 *  3. On acceptance the Google account's email MUST equal the invited email.
 *     Without this check anyone holding the link could join with any account.
 *     -> acceptInvitation()
 *  4. tenant_id and role come from the invitation row, never from the user.
 *     -> acceptInvitation()
 *  5. Single use: status flips to 'accepted' inside the same path, and a
 *     partial unique index keeps at most one pending invite per (tenant,email).
 */

export type InvitableRole = Exclude<UserRole, "super_admin">;

const TOKEN_BYTES = 32; // 256 bits

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Constant-time comparison, used when confirming a looked-up hash. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function inviteUrl(token: string): string {
  return `${publicEnv.appUrl.replace(/\/$/, "")}/invite/${token}`;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type CreateInvitationInput = {
  tenantId: string;
  email: string;
  role: InvitableRole;
  fullName?: string | null;
  message?: string | null;
  classIds?: string[];
  childIds?: string[];
  invitedBy: string | null;
  invitedByEmail?: string | null;
};

export type CreateInvitationResult = {
  invitation: InvitationRow;
  /** Returned only so a dev environment can display it. Never persisted. */
  token: string;
  url: string;
  /**
   * Whether the invitation email actually left the building.
   *
   * False is a normal, recoverable state — an unverified sending domain, a
   * provider outage, a bounced address. The invitation is still valid, so the
   * UI surfaces the link and tells the operator to send it by hand rather
   * than reporting success and leaving the invitee waiting for nothing.
   */
  emailDelivered: boolean;
  emailError?: string;
};

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const supabase = createServiceRoleClient();
  const email = normaliseEmail(input.email);
  const { token, hash } = generateToken();

  const ttlHours = Number.isFinite(serverEnv().inviteTtlHours)
    ? serverEnv().inviteTtlHours
    : 72;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  // Supersede any outstanding invite for the same person at the same school,
  // so the newest link is the only one that works.
  await supabase
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("tenant_id", input.tenantId)
    .eq("email", email)
    .eq("status", "pending");

  // Refuse to invite somebody who already has an account at this school.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    throw new Error("That email already belongs to a member of this school.");
  }

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: input.tenantId,
      email,
      role: input.role,
      token_hash: hash,
      status: "pending",
      expires_at: expiresAt,
      invited_by: input.invitedBy,
      class_ids: input.classIds ?? [],
      child_ids: input.childIds ?? [],
      full_name: input.fullName ?? null,
      message: input.message ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;

  const invitation = data as InvitationRow;
  const url = inviteUrl(token);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", input.tenantId)
    .maybeSingle();

  const schoolName = (tenant as { name: string } | null)?.name ?? publicEnv.appName;

  const delivery = await sendNotification({
    to: { email, name: input.fullName },
    kind: "invite",
    subject: `You have been invited to ${schoolName}`,
    text: [
      `Hello${input.fullName ? ` ${input.fullName}` : ""},`,
      "",
      `You have been invited to join ${schoolName} on ${publicEnv.appName} as ${describeRole(input.role)}.`,
      input.message ? `\n"${input.message}"\n` : "",
      "Open this link and choose “Continue with Google”:",
      url,
      "",
      `Important: you must sign in with ${email}. The invitation is tied to that address.`,
      `The link can only be used once and expires in ${ttlHours} hours.`,
      "",
      "If you were not expecting this invitation you can ignore this email.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const emailResult = delivery.find((result) => result.channel === "email");
  // `skipped` is the console provider in development: nothing was sent, but
  // the link was printed to the server log, which is the intended behaviour
  // there rather than a failure to report.
  const emailDelivered = Boolean(emailResult?.ok);

  await recordAudit({
    tenantId: input.tenantId,
    actorId: input.invitedBy,
    actorEmail: input.invitedByEmail ?? null,
    action: "invite.create",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: {
      email,
      role: input.role,
      expires_at: expiresAt,
      email_delivered: emailDelivered,
    },
  });

  return {
    invitation,
    token,
    url,
    emailDelivered,
    emailError: emailResult?.ok ? undefined : emailResult?.error,
  };
}

export function describeRole(role: InvitableRole): string {
  switch (role) {
    case "owner":
      return "the school owner";
    case "admin":
      return "an administrator";
    case "teacher":
      return "a teacher";
    case "parent":
      return "a parent";
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type InvitationWithTenant = InvitationRow & { tenant: Pick<TenantRow, "id" | "name" | "slug" | "logo_url" | "subscription_status"> };

export type InvitationLookup =
  | { ok: true; invitation: InvitationWithTenant }
  | { ok: false; reason: "not_found" | "expired" | "used" | "revoked" };

/**
 * Resolve a raw token. Safe to call before authentication — it reveals only
 * the school name and the invited email (which the recipient already knows),
 * and never the token hash.
 */
export async function findInvitationByToken(token: string): Promise<InvitationLookup> {
  if (!token || token.length < 20) return { ok: false, reason: "not_found" };

  const supabase = createServiceRoleClient();
  const hash = hashToken(token);

  const { data, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(id, name, slug, logo_url, subscription_status)")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };

  const invitation = data as unknown as InvitationWithTenant;

  if (!hashesMatch(invitation.token_hash, hash)) {
    return { ok: false, reason: "not_found" };
  }

  if (invitation.status === "revoked") return { ok: false, reason: "revoked" };
  if (invitation.status === "accepted") return { ok: false, reason: "used" };

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    // Mark it so the state is visible in the admin list, not just computed.
    await supabase.from("invitations").update({ status: "expired" }).eq("id", invitation.id);
    return { ok: false, reason: "expired" };
  }

  return { ok: true, invitation };
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

export type AcceptResult =
  | { ok: true; tenantSlug: string; role: InvitableRole }
  | { ok: false; reason: "invalid" | "expired" | "used" | "revoked" | "email_mismatch"; invitedEmail?: string };

/**
 * Complete an invitation for an already-authenticated Supabase user.
 *
 * THE EMAIL MATCH IS MANDATORY. Without it, anybody who obtained the link
 * could sign in with any Google account and land inside the tenant.
 */
export async function acceptInvitation(token: string, user: User): Promise<AcceptResult> {
  const lookup = await findInvitationByToken(token);

  if (!lookup.ok) {
    const reason = lookup.reason === "not_found" ? "invalid" : lookup.reason;
    return { ok: false, reason };
  }

  const invitation = lookup.invitation;
  const userEmail = normaliseEmail(user.email ?? "");
  const invitedEmail = normaliseEmail(invitation.email);

  if (!userEmail || userEmail !== invitedEmail) {
    await recordAudit({
      tenantId: invitation.tenant_id,
      actorId: null,
      actorEmail: userEmail || null,
      action: "invite.reject_email_mismatch",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { invited_email: invitedEmail, attempted_email: userEmail || null },
    });
    return { ok: false, reason: "email_mismatch", invitedEmail };
  }

  const supabase = createServiceRoleClient();

  // Claim the invitation first. If another request got here a moment earlier
  // the filter on status='pending' matches nothing and we bail out, so a
  // double-click cannot provision two profiles.
  const { data: claimed, error: claimError } = await supabase
    .from("invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return { ok: false, reason: "used" };
  }

  // Provision the profile. tenant_id and role come from the invitation row.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      tenant_id: invitation.tenant_id,
      role: invitation.role,
      email: invitedEmail,
      full_name:
        invitation.full_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null,
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    // Put the invitation back so the person can retry rather than being stuck
    // with a consumed token and no account.
    await supabase
      .from("invitations")
      .update({ status: "pending", accepted_at: null, accepted_by: null })
      .eq("id", invitation.id);
    throw profileError;
  }

  // Apply the role-specific payload the inviter attached.
  if (invitation.role === "teacher" && invitation.class_ids.length > 0) {
    await supabase.from("class_teachers").upsert(
      invitation.class_ids.map((classId) => ({
        tenant_id: invitation.tenant_id,
        class_id: classId,
        profile_id: user.id,
        is_lead: false,
      })),
      { onConflict: "class_id,profile_id" },
    );
  }

  if (invitation.role === "parent" && invitation.child_ids.length > 0) {
    await supabase.from("guardians").upsert(
      invitation.child_ids.map((childId) => ({
        tenant_id: invitation.tenant_id,
        child_id: childId,
        profile_id: user.id,
        is_primary: false,
        can_pickup: true,
      })),
      { onConflict: "child_id,profile_id" },
    );
  }

  await recordAudit({
    tenantId: invitation.tenant_id,
    actorId: user.id,
    actorEmail: invitedEmail,
    action: "invite.accept",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: { role: invitation.role },
  });

  return { ok: true, tenantSlug: invitation.tenant.slug, role: invitation.role };
}

export async function revokeInvitation(
  invitationId: string,
  actor: { id: string; email: string; tenantId: string },
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("tenant_id", actor.tenantId) // never let an admin revoke across schools
    .eq("status", "pending");

  if (error) throw error;

  await recordAudit({
    tenantId: actor.tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "invite.revoke",
    entityType: "invitation",
    entityId: invitationId,
  });
}

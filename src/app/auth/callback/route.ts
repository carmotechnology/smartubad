import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/lib/auth/invites";
import { recordAudit } from "@/lib/audit";
import { isSuperAdminEmail } from "@/lib/env";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ProfileRow, TenantRow } from "@/lib/supabase/database.types";

/**
 * OAuth / magic-link landing point. Everything that decides *which tenant and
 * role a person gets* happens here, on the server, and nowhere else.
 *
 * Flow:
 *   1. Exchange the code (or verify the OTP) for a session.
 *   2. If an invite token came along, accept it — which enforces the
 *      mandatory email match and provisions the profile from the invite.
 *   3. Otherwise require an existing profile. A stranger who signs in with
 *      Google gets signed straight back out; they belong to no school.
 *   4. Send the user to their tenant, or the platform panel.
 */

function errorRedirect(
  request: NextRequest,
  error: string,
  extra?: Record<string, string>,
) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  for (const [key, value] of Object.entries(extra ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;
  const inviteToken = searchParams.get("invite");
  const next = searchParams.get("next") ?? "/";

  try {
    await enforceRateLimit("inviteAccept");
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorRedirect(request, "rate_limited");
    }
    throw error;
  }

  const supabase = await createClient();

  // --- 1. Establish the session -------------------------------------------
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] code exchange failed", error.message);
      return errorRedirect(request, "oauth_failed");
    }
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) {
      console.error("[auth/callback] otp verification failed", error.message);
      return errorRedirect(request, "oauth_failed");
    }
  } else {
    return errorRedirect(request, "oauth_failed");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return errorRedirect(request, "oauth_failed");

  // --- 2. Invitation path --------------------------------------------------
  if (inviteToken) {
    const result = await acceptInvitation(inviteToken, user);

    if (!result.ok) {
      // The session is real but the invitation was not honoured. Sign out so
      // the visitor is not left holding a session with no profile.
      await supabase.auth.signOut();

      switch (result.reason) {
        case "email_mismatch":
          return errorRedirect(request, "email_mismatch", {
            invited: result.invitedEmail ?? "",
            actual: user.email ?? "",
          });
        case "expired":
          return errorRedirect(request, "invite_expired");
        case "used":
          return errorRedirect(request, "invite_used");
        case "revoked":
          return errorRedirect(request, "invite_revoked");
        default:
          return errorRedirect(request, "invite_invalid");
      }
    }

    await recordAudit({
      tenantId: null,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "auth.login",
      metadata: { method: code ? "oauth" : "magic_link", via: "invite" },
    });

    return NextResponse.redirect(new URL(`/${result.tenantSlug}`, request.url));
  }

  // --- 3. Ordinary sign-in: a profile must already exist -------------------
  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let profile = profileData as ProfileRow | null;

  // Bootstrap: the platform owner listed in SUPER_ADMIN_EMAILS. This is the
  // only account in the system created without an invitation, and it is
  // gated on an env var the deployer controls, not on anything user-supplied.
  if (!profile && isSuperAdminEmail(user.email)) {
    const admin = createServiceRoleClient();
    const { data: created, error } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          tenant_id: null,
          role: "super_admin",
          email: (user.email ?? "").toLowerCase(),
          full_name:
            (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
          avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
          is_active: true,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("[auth/callback] super-admin bootstrap failed", error.message);
      await supabase.auth.signOut();
      return errorRedirect(request, "oauth_failed");
    }
    profile = created as ProfileRow;
  }

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return errorRedirect(request, "no_profile");
  }

  await recordAudit({
    tenantId: profile.tenant_id,
    actorId: profile.id,
    actorEmail: profile.email,
    action: "auth.login",
    metadata: { method: code ? "oauth" : "magic_link" },
  });

  // Best-effort presence tracking; never block sign-in on it.
  void supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", profile.id);

  // --- 4. Destination ------------------------------------------------------
  if (profile.role === "super_admin") {
    return NextResponse.redirect(new URL("/platform", request.url));
  }

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", profile.tenant_id ?? "")
    .maybeSingle();

  const tenant = tenantData as Pick<TenantRow, "slug"> | null;
  if (!tenant) {
    await supabase.auth.signOut();
    return errorRedirect(request, "no_profile");
  }

  // Only follow `next` when it is a same-site path, so the parameter cannot
  // be used to bounce a freshly authenticated user to another origin.
  const destination =
    next.startsWith("/") && !next.startsWith("//") && next !== "/"
      ? next
      : `/${tenant.slug}`;

  return NextResponse.redirect(new URL(destination, request.url));
}

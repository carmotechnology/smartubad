import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type {
  AcademicYearRow,
  ProfileRow,
  TenantRow,
  UserRole,
} from "@/lib/supabase/database.types";
import { can, type Permission } from "./rbac";
import {
  ForbiddenError,
  SubscriptionInactiveError,
  TenantNotFoundError,
  UnauthenticatedError,
} from "./errors";

/**
 * Derived from the factory rather than written by hand: supabase-js resolves
 * several generic parameters from the Database type, and spelling them out
 * here would drift the moment the client version changes.
 */
export type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything a server component or action needs to answer "who is asking, on
 * behalf of which school, and may they write?". Resolve it once at the top of
 * a page and thread it down — never re-derive identity further in.
 */
export type TenantContext = {
  supabase: Db;
  user: User;
  profile: ProfileRow;
  role: UserRole;
  tenant: TenantRow;
  tenantId: string;
  /** false when subscription_status is past_due or suspended (§7bis). */
  canWrite: boolean;
  activeYear: AcademicYearRow | null;
};

/**
 * `getUser()` re-validates the JWT with the Auth server on every call.
 * Never trust `getSession()` on the server: it reads the cookie without
 * verifying it, so a forged cookie would sail straight through.
 * `cache()` collapses the repeated calls within one request.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

export const getProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
});

export async function requireProfile(): Promise<{ user: User; profile: ProfileRow }> {
  const user = await getAuthUser();
  if (!user) throw new UnauthenticatedError();

  const profile = await getProfile();
  if (!profile) {
    // Authenticated with Supabase but never provisioned by an invite. This is
    // the state a stranger who signs in with Google lands in — they belong to
    // no tenant and can see nothing.
    throw new ForbiddenError(
      "Your account is not linked to a school yet. Ask your school administrator for an invitation.",
    );
  }
  if (!profile.is_active) {
    throw new ForbiddenError("Your account has been deactivated. Contact your school administrator.");
  }

  return { user, profile };
}

export const getTenantBySlug = cache(async (slug: string): Promise<TenantRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  return (data as TenantRow | null) ?? null;
});

export const getActiveAcademicYear = cache(
  async (tenantId: string): Promise<AcademicYearRow | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("academic_years")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    return (data as AcademicYearRow | null) ?? null;
  },
);

/**
 * The gate every tenant-scoped page and action passes through.
 *
 * Note what it does NOT do: it never reads a tenant id from the request. The
 * slug in the URL is only used to look up a tenant, which is then checked
 * against the tenant recorded on the caller's profile. Changing the slug in
 * the address bar gets you a 403, not someone else's school.
 */
export async function requireTenantContext(slug: string): Promise<TenantContext> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new TenantNotFoundError();

  if (profile.role === "super_admin") {
    // Super-admins manage tenants; they do not browse inside them.
    throw new ForbiddenError(
      "Platform administrators cannot open a school's workspace. Use the platform panel.",
    );
  }

  if (profile.tenant_id !== tenant.id) {
    // Deliberately the same message as a missing tenant: do not confirm to an
    // outsider that a given slug exists.
    throw new TenantNotFoundError();
  }

  const canWrite =
    tenant.subscription_status === "active" || tenant.subscription_status === "trialing";

  return {
    supabase,
    user,
    profile,
    role: profile.role,
    tenant,
    tenantId: tenant.id,
    canWrite,
    activeYear: await getActiveAcademicYear(tenant.id),
  };
}

export async function requireSuperAdmin(): Promise<{ user: User; profile: ProfileRow }> {
  const { user, profile } = await requireProfile();
  if (profile.role !== "super_admin") {
    throw new ForbiddenError("Platform administrator access required.");
  }
  return { user, profile };
}

/** Throws unless the caller's role holds `permission`. */
export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx.role, permission)) {
    throw new ForbiddenError();
  }
}

/**
 * Section 7bis, server side. The UI also hides write controls and shows a
 * banner, but this is what actually stops the write.
 */
export function assertWritable(ctx: TenantContext): void {
  if (!ctx.canWrite) throw new SubscriptionInactiveError();
}

/** Convenience: permission + subscription in one call, for write actions. */
export function assertCanWrite(ctx: TenantContext, permission: Permission): void {
  requirePermission(ctx, permission);
  assertWritable(ctx);
}

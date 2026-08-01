import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv, requireServiceRoleKey } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Request-scoped client carrying the signed-in user's session.
 *
 * THIS is the client almost everything should use: it runs as the
 * `authenticated` role, so every Postgres RLS policy applies. A bug in our
 * application filtering still cannot leak another tenant's rows.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            });
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // `middleware.ts` refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES RLS COMPLETELY.
 *
 * Legitimate uses, and no others:
 *   1. Invite acceptance — must write a profile before one exists.
 *   2. Super-admin tenant management — operates across tenants by design.
 *   3. Public admission intake — the submitter has no account.
 *   4. Audit logging — must be unforgeable by the acting user.
 *   5. The seed script.
 *
 * Every caller is responsible for its own authorisation check first, and for
 * writing an audit entry. Never hand this client a user-supplied tenant_id
 * without verifying the caller belongs to that tenant.
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(publicEnv.supabaseUrl, requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* service-role client is stateless — it must never touch cookies */
      },
    },
  });
}

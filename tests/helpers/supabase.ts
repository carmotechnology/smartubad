import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Test harness for the RLS suite.
 *
 * These tests talk to a real Supabase project, because the thing under test IS
 * Postgres row-level security — mocking it would test nothing. They read
 * TEST_SUPABASE_* first so a throwaway project can be used, and fall back to
 * the ordinary development variables.
 *
 * If no credentials are present the suite SKIPS rather than fails, so `npm test`
 * still works on a machine that has never been pointed at a database.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyClient = SupabaseClient<any, "public", any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SUPABASE_URL =
  process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

export const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

export function adminClient(): AnyClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A client authenticated AS a given user — the `authenticated` Postgres role
 * with that user's JWT, which is exactly what the app uses in production and
 * therefore exactly what RLS sees.
 */
export async function clientForUser(userId: string): Promise<AnyClient> {
  const admin = adminClient();

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(`Could not load test user ${userId}: ${userError?.message}`);
  }

  // Mint a one-time link, then exchange its token for a real session.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not generate a session for ${userData.user.email}: ${error?.message}`);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  if (verifyError) {
    throw new Error(`Could not verify session for ${userData.user.email}: ${verifyError.message}`);
  }

  return client;
}

export async function createTestUser(email: string, fullName: string): Promise<string> {
  const admin = adminClient();

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

export async function deleteTestUser(email: string): Promise<void> {
  const admin = adminClient();
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

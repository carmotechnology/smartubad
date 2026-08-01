import { z } from "zod";

/**
 * Environment access. Fail loudly at boot rather than mysteriously at runtime.
 *
 * Public values are read through `process.env.NEXT_PUBLIC_*` literals because
 * Next.js inlines them at build time — they cannot be read dynamically.
 */

const publicSchema = z.object({
  supabaseUrl: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  supabaseKey: z.string().min(20, "A Supabase publishable/anon key is required"),
  appUrl: z.string().url().default("http://localhost:3000"),
  appName: z.string().default("Smartubad"),
});

/**
 * Supabase is mid-migration from legacy `anon` JWTs to `sb_publishable_...`
 * keys. Both work with the same client, so prefer the new one and fall back.
 */
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const publicEnv = publicSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: publishableKey,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Smartubad",
});

/**
 * Server-only configuration. Never import this from a client component —
 * the `server-only` guard in the modules that consume it enforces that.
 */
export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    inviteTtlHours: Number(process.env.INVITE_TOKEN_TTL_HOURS ?? 72),
    notifications: {
      provider: (process.env.NOTIFICATIONS_PROVIDER ?? "console") as "console" | "resend",
      resendApiKey: process.env.RESEND_API_KEY ?? "",
      fromEmail: process.env.NOTIFICATIONS_FROM_EMAIL ?? "Smartubad <noreply@example.com>",
    },
    sms: {
      provider: (process.env.SMS_PROVIDER ?? "none") as "none" | "hormuud",
      apiUrl: process.env.HORMUUD_API_URL ?? "",
      username: process.env.HORMUUD_API_USERNAME ?? "",
      password: process.env.HORMUUD_API_PASSWORD ?? "",
      senderId: process.env.HORMUUD_SENDER_ID ?? "",
    },
  };
}

/**
 * The service-role key bypasses RLS entirely. Anything that needs it is a
 * deliberate, audited operation (invite acceptance, super-admin actions,
 * public admission intake), so refuse to run rather than silently degrade to
 * an under-privileged client.
 */
export function requireServiceRoleKey(): string {
  const key = serverEnv().serviceRoleKey;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (and to the " +
        "Vercel project settings) before using invite, seed or super-admin features.",
    );
  }
  return key;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverEnv().superAdminEmails.includes(email.trim().toLowerCase());
}

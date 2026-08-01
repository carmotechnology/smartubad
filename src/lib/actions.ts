import "server-only";

import { z } from "zod";

import { requireTenantContext, type TenantContext } from "@/lib/auth/session";
import { assertCanWrite, requirePermission } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { RateLimitError } from "@/lib/rate-limit";
import { scoped, TenantScope } from "@/lib/db/scope";
import type { Permission } from "@/lib/auth/rbac";

/**
 * Uniform shape for every server action, so forms can render errors without
 * each one inventing its own protocol.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Turns anything thrown inside an action into a safe, user-facing message.
 * Unexpected errors are logged in full and reported generically — a raw
 * Postgres error can disclose table and column names.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (isAuthError(error)) {
    return { ok: false, error: error.message };
  }

  if (error instanceof RateLimitError) {
    return { ok: false, error: error.message };
  }

  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Postgres RLS rejection. Reaching here means the app-layer check let
  // something through that the database refused — worth shouting about.
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("row-level security") || message.includes("42501")) {
    console.error("[action] RLS rejected a write that passed app checks", error);
    return { ok: false, error: "You do not have permission to do that." };
  }

  console.error("[action] unexpected failure", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

type ActionHandler<T> = (args: {
  ctx: TenantContext;
  db: TenantScope;
}) => Promise<ActionResult<T>>;

/**
 * Wraps a read-only action: resolves the tenant context from the slug,
 * checks the permission, and normalises failures.
 */
export async function withTenant<T>(
  tenantSlug: string,
  permission: Permission | null,
  handler: ActionHandler<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireTenantContext(tenantSlug);
    if (permission) requirePermission(ctx, permission);
    return await handler({ ctx, db: scoped(ctx) });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Wraps a write action. Identical to `withTenant` but also refuses when the
 * tenant's subscription is past_due or suspended (§7bis) — the server-side
 * half of the read-only mode the banner advertises.
 */
export async function withTenantWrite<T>(
  tenantSlug: string,
  permission: Permission,
  handler: ActionHandler<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireTenantContext(tenantSlug);
    assertCanWrite(ctx, permission);
    return await handler({ ctx, db: scoped(ctx) });
  } catch (error) {
    return toActionError(error);
  }
}

/** Reads a Zod schema out of a FormData payload. */
export function parseForm<S extends z.ZodTypeAny>(
  schema: S,
  formData: FormData,
): z.infer<S> {
  const raw: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;

    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const existing = raw[name];
      raw[name] = Array.isArray(existing) ? [...existing, value] : [value];
      continue;
    }

    // Unchecked HTML checkboxes submit nothing at all, so an explicit
    // "true"/"false" hidden pairing is what actually round-trips.
    raw[key] = value === "on" ? true : value;
  }

  return schema.parse(raw);
}

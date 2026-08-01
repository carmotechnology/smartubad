import "server-only";

import { headers } from "next/headers";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Audit trail for sensitive actions: child-data changes, logins, invitations,
 * fee changes, subscription changes.
 *
 * Written with the service-role client on purpose. `audit_logs` has no insert
 * policy for `authenticated`, so a user cannot forge or suppress entries in
 * their own trail.
 */

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "invite.create"
  | "invite.accept"
  | "invite.reject_email_mismatch"
  | "invite.revoke"
  | "child.create"
  | "child.update"
  | "child.withdraw"
  | "child.allergy_change"
  | "child.medical_change"
  | "child.document_upload"
  | "attendance.record"
  | "report.publish"
  | "incident.create"
  | "fee.create"
  | "fee.payment"
  | "fee.update"
  | "transaction.create"
  | "staff.role_change"
  | "staff.deactivate"
  | "application.review"
  | "tenant.create"
  | "tenant.update"
  | "tenant.subscription_change";

type AuditInput = {
  tenantId: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestMeta();
    const supabase = createServiceRoleClient();

    await supabase.from("audit_logs").insert({
      tenant_id: input.tenantId,
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: (input.metadata ?? {}) as Json,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (error) {
    // Auditing must never break the user's action. Losing a log line is bad;
    // failing a teacher's attendance save because of it is worse.
    console.error("[audit] failed to record entry", input.action, error);
  }
}

/**
 * Diff helper so update audits record what actually changed rather than the
 * whole row — which would copy children's medical data into the log.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): string[] {
  return Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toActionError, type ActionResult } from "@/lib/actions";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createTenantSchema, updateSubscriptionSchema } from "@/lib/validation/schemas";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createInvitation } from "@/lib/auth/invites";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";
import type { TenantRow } from "@/lib/supabase/database.types";

/**
 * Platform (super-admin) operations. These are the only actions that cross
 * tenant boundaries, so each one starts with `requireSuperAdmin()` and uses
 * the service-role client deliberately.
 */

/** Level 1 of the invite chain: create the school, then invite its owner. */
export async function createTenantWithOwner(
  input: z.infer<typeof createTenantSchema>,
): Promise<ActionResult<{ tenantId: string; inviteUrl: string }>> {
  try {
    const { profile } = await requireSuperAdmin();
    const values = createTenantSchema.parse(input);

    const admin = createServiceRoleClient();

    const { data: existing } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", values.slug)
      .maybeSingle();

    if (existing) {
      return { ok: false, error: "That web address is already taken.", fieldErrors: { slug: ["Already taken"] } };
    }

    const { data, error } = await admin
      .from("tenants")
      .insert({
        name: values.name,
        slug: values.slug,
        plan: values.plan,
        // New schools start on trial, not active. Moving to `active` is a
        // deliberate super-admin decision once payment has arrived.
        subscription_status: "trialing",
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        timezone: values.timezone,
        locale: values.locale,
        currency: values.currency,
        contact_email: values.ownerEmail,
      })
      .select("id")
      .single();

    if (error) throw error;
    const tenantId = (data as { id: string }).id;

    const { url } = await createInvitation({
      tenantId,
      email: values.ownerEmail,
      role: "owner",
      fullName: emptyToNull(values.ownerName ?? null),
      invitedBy: profile.id,
      invitedByEmail: profile.email,
    });

    await recordAudit({
      tenantId,
      actorId: profile.id,
      actorEmail: profile.email,
      action: "tenant.create",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { slug: values.slug, owner_email: values.ownerEmail },
    });

    revalidatePath("/platform");
    return { ok: true, data: { tenantId, inviteUrl: url } };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * The manual access switch (§7bis). No payment processor in v1: this is what
 * turns a school on and off.
 *
 * `suspended` and `past_due` are SOFT — the tenant keeps reading its data and
 * loses only writes. Nothing is deleted, ever, and flipping back to `active`
 * restores write access immediately with no further steps.
 */
export async function updateSubscriptionStatus(
  input: z.infer<typeof updateSubscriptionSchema>,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSuperAdmin();
    const values = updateSubscriptionSchema.parse(input);

    const admin = createServiceRoleClient();

    const { data: before } = await admin
      .from("tenants")
      .select("subscription_status, name")
      .eq("id", values.tenantId)
      .maybeSingle();

    const { error } = await admin
      .from("tenants")
      .update({
        subscription_status: values.subscriptionStatus,
        ...(values.plan ? { plan: values.plan } : {}),
        status_note: emptyToNull(values.statusNote ?? null),
      })
      .eq("id", values.tenantId);

    if (error) throw error;

    await recordAudit({
      tenantId: values.tenantId,
      actorId: profile.id,
      actorEmail: profile.email,
      action: "tenant.subscription_change",
      entityType: "tenant",
      entityId: values.tenantId,
      metadata: {
        from: (before as Pick<TenantRow, "subscription_status"> | null)?.subscription_status,
        to: values.subscriptionStatus,
        note: values.statusNote ?? null,
      },
    });

    revalidatePath("/platform");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Re-send (or first-send) the owner invitation for a school. */
export async function resendOwnerInvite(
  tenantId: string,
  email: string,
): Promise<ActionResult<{ inviteUrl: string; emailDelivered: boolean; emailError?: string }>> {
  try {
    const { profile } = await requireSuperAdmin();

    const { url, emailDelivered, emailError } = await createInvitation({
      tenantId,
      email,
      role: "owner",
      invitedBy: profile.id,
      invitedByEmail: profile.email,
    });

    revalidatePath("/platform");
    return { ok: true, data: { inviteUrl: url, emailDelivered, emailError } };
  } catch (error) {
    return toActionError(error);
  }
}

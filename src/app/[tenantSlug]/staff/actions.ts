"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { inviteParentSchema, inviteStaffSchema } from "@/lib/validation/schemas";
import { createInvitation, revokeInvitation } from "@/lib/auth/invites";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emptyToNull } from "@/lib/utils";
import { ForbiddenError } from "@/lib/auth/errors";

/**
 * Levels 2 and 3 of the invitation chain (level 1, super-admin → owner, lives
 * in the platform panel).
 *
 * In every case the inviter fixes the tenant and the role; the invitee never
 * chooses either. The tenant id comes from the session, never from the form.
 */

export async function inviteStaff(
  tenantSlug: string,
  input: z.infer<typeof inviteStaffSchema>,
): Promise<ActionResult<{ inviteUrl: string }>> {
  return withTenantWrite(tenantSlug, "invites.staff", async ({ ctx, db }) => {
    await enforceRateLimit("inviteCreate", ctx.profile.id);
    const values = inviteStaffSchema.parse(input);

    // Verify the classes belong to this tenant before binding them into the
    // invite, so a tampered form cannot attach a teacher to another school.
    if (values.classIds.length > 0) {
      const { data, error } = await db.select("classes", "id").in("id", values.classIds);
      if (error) throw error;
      const valid = new Set((data ?? []).map((row: { id: string }) => row.id));
      if (values.classIds.some((id) => !valid.has(id))) {
        throw new ForbiddenError("One of those classes does not belong to this school.");
      }
    }

    const { url } = await createInvitation({
      tenantId: ctx.tenantId,
      email: values.email,
      role: values.role,
      fullName: emptyToNull(values.fullName),
      message: emptyToNull(values.message),
      classIds: values.classIds,
      invitedBy: ctx.profile.id,
      invitedByEmail: ctx.profile.email,
    });

    revalidatePath(`/${tenantSlug}/staff`);
    return { ok: true, data: { inviteUrl: url } };
  });
}

export async function inviteParent(
  tenantSlug: string,
  input: z.infer<typeof inviteParentSchema>,
): Promise<ActionResult<{ inviteUrl: string }>> {
  return withTenantWrite(tenantSlug, "invites.parents", async ({ ctx, db }) => {
    await enforceRateLimit("inviteCreate", ctx.profile.id);
    const values = inviteParentSchema.parse(input);

    // The children must be ones this user can already see. For a teacher that
    // is their own class only — RLS makes the check honest.
    const { data, error } = await db.select("children", "id").in("id", values.childIds);
    if (error) throw error;
    const visible = new Set((data ?? []).map((row: { id: string }) => row.id));
    if (values.childIds.some((id) => !visible.has(id))) {
      throw new ForbiddenError("You cannot link a parent to a child you do not manage.");
    }

    const { url } = await createInvitation({
      tenantId: ctx.tenantId,
      email: values.email,
      role: "parent",
      fullName: emptyToNull(values.fullName),
      message: emptyToNull(values.message),
      childIds: values.childIds,
      invitedBy: ctx.profile.id,
      invitedByEmail: ctx.profile.email,
    });

    revalidatePath(`/${tenantSlug}/staff`);
    return { ok: true, data: { inviteUrl: url } };
  });
}

export async function revokeInvite(
  tenantSlug: string,
  invitationId: string,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "invites.staff", async ({ ctx }) => {
    await revokeInvitation(invitationId, {
      id: ctx.profile.id,
      email: ctx.profile.email,
      tenantId: ctx.tenantId,
    });
    revalidatePath(`/${tenantSlug}/staff`);
    return { ok: true };
  });
}

export async function setStaffActive(
  tenantSlug: string,
  profileId: string,
  isActive: boolean,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "staff.manage", async ({ ctx, db }) => {
    if (profileId === ctx.profile.id) {
      throw new ForbiddenError("You cannot deactivate your own account.");
    }

    const { error } = await db.update("profiles", profileId, { is_active: isActive });
    if (error) throw error;

    revalidatePath(`/${tenantSlug}/staff`);
    return { ok: true };
  });
}

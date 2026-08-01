"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { childSchema, pickupNotesSchema, allergySchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";
import { ForbiddenError } from "@/lib/auth/errors";
import type { ChildRow } from "@/lib/supabase/database.types";

/**
 * Child records. Allergies are written alongside the child in the same action
 * because a child created without their allergy list is exactly the gap the
 * safety UI exists to close.
 */

export async function createChild(
  tenantSlug: string,
  input: z.infer<typeof childSchema>,
): Promise<ActionResult<{ childId: string }>> {
  return withTenantWrite(tenantSlug, "children.manage", async ({ ctx, db }) => {
    const values = childSchema.parse(input);

    const { data, error } = await db
      .insert("children", {
        first_name: values.firstName,
        last_name: values.lastName,
        preferred_name: emptyToNull(values.preferredName),
        date_of_birth: values.dateOfBirth,
        gender: values.gender ?? null,
        status: values.status,
        notes: emptyToNull(values.notes),
      })
      .select("id")
      .single();

    if (error) throw error;
    const childId = (data as { id: string }).id;

    if (values.allergies.length > 0) {
      const { error: allergyError } = await db.insert(
        "child_allergies",
        values.allergies.map((allergy) => ({
          child_id: childId,
          allergen: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
          required_action: allergy.requiredAction,
          medication: emptyToNull(allergy.medication),
          medication_location: emptyToNull(allergy.medicationLocation),
          notes: emptyToNull(allergy.notes),
        })),
      );
      if (allergyError) throw allergyError;
    }

    if (values.emergencyContacts.length > 0) {
      const { error: contactError } = await db.insert(
        "emergency_contacts",
        values.emergencyContacts.map((contact) => ({
          child_id: childId,
          name: contact.name,
          relationship: emptyToNull(contact.relationship),
          phone: contact.phone,
          email: emptyToNull(contact.email),
          priority: contact.priority,
        })),
      );
      if (contactError) throw contactError;
    }

    // Enrol into the active year, optionally into a class.
    const academicYearId = db.requireActiveYearId();
    const { error: enrolError } = await db.insert("enrollments", {
      academic_year_id: academicYearId,
      child_id: childId,
      class_id: emptyToNull(values.classId),
      status: values.status === "waitlist" ? "waitlist" : "active",
    });
    if (enrolError) throw enrolError;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "child.create",
      entityType: "child",
      entityId: childId,
      metadata: {
        allergy_count: values.allergies.length,
        // Never copy allergy detail into the audit log — it is medical data
        // and the log has a wider read audience than the child record.
        has_severe_allergy: values.allergies.some((a) => a.severity === "severe"),
      },
    });

    revalidatePath(`/${tenantSlug}/children`);
    return { ok: true, data: { childId } };
  });
}

export async function updateChild(
  tenantSlug: string,
  childId: string,
  input: z.infer<typeof childSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "children.manage", async ({ ctx, db }) => {
    const values = childSchema.parse(input);

    const { error } = await db.update("children", childId, {
      first_name: values.firstName,
      last_name: values.lastName,
      preferred_name: emptyToNull(values.preferredName),
      date_of_birth: values.dateOfBirth,
      gender: values.gender ?? null,
      status: values.status,
      notes: emptyToNull(values.notes),
    });
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "child.update",
      entityType: "child",
      entityId: childId,
    });

    revalidatePath(`/${tenantSlug}/children/${childId}`);
    return { ok: true };
  });
}

export async function addAllergy(
  tenantSlug: string,
  childId: string,
  input: z.infer<typeof allergySchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "children.manage", async ({ ctx, db }) => {
    const values = allergySchema.parse(input);

    const { error } = await db.insert("child_allergies", {
      child_id: childId,
      allergen: values.allergen,
      severity: values.severity,
      reaction: values.reaction,
      required_action: values.requiredAction,
      medication: emptyToNull(values.medication),
      medication_location: emptyToNull(values.medicationLocation),
      notes: emptyToNull(values.notes),
    });
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "child.allergy_change",
      entityType: "child",
      entityId: childId,
      metadata: { change: "add", severity: values.severity },
    });

    revalidatePath(`/${tenantSlug}/children/${childId}`);
    return { ok: true };
  });
}

export async function removeAllergy(
  tenantSlug: string,
  childId: string,
  allergyId: string,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "children.manage", async ({ ctx, db }) => {
    const { error } = await db.delete("child_allergies", allergyId);
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "child.allergy_change",
      entityType: "child",
      entityId: childId,
      metadata: { change: "remove", allergy_id: allergyId },
    });

    revalidatePath(`/${tenantSlug}/children/${childId}`);
    return { ok: true };
  });
}

/**
 * The one field a parent may edit on their own child.
 *
 * RLS cannot restrict a policy to a single column, so the child table's update
 * policy is admin-only and this action does the narrow thing instead: verify
 * guardianship, then write `pickup_notes` and nothing else.
 */
export async function updatePickupNotes(
  tenantSlug: string,
  input: z.infer<typeof pickupNotesSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "children.edit_pickup_notes", async ({ ctx, db }) => {
    const values = pickupNotesSchema.parse(input);

    if (ctx.role === "parent") {
      const { data, error } = await db
        .select("guardians", "id")
        .eq("child_id", values.childId)
        .eq("profile_id", ctx.profile.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ForbiddenError("That is not your child's record.");

      // Parents cannot use the admin-only children update policy, so this one
      // narrow write goes through the service-role client after the ownership
      // check above — the only column it is allowed to touch is pickup_notes.
      const { createServiceRoleClient } = await import("@/lib/supabase/server");
      const admin = createServiceRoleClient();
      const { error: writeError } = await admin
        .from("children")
        .update({ pickup_notes: values.pickupNotes })
        .eq("id", values.childId)
        .eq("tenant_id", ctx.tenantId);
      if (writeError) throw writeError;
    } else {
      const { error } = await db.update("children", values.childId, {
        pickup_notes: values.pickupNotes,
      } as Partial<ChildRow>);
      if (error) throw error;
    }

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "child.update",
      entityType: "child",
      entityId: values.childId,
      metadata: { field: "pickup_notes" },
    });

    revalidatePath(`/${tenantSlug}/children/${values.childId}`);
    return { ok: true };
  });
}

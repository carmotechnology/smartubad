"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { applicationSchema, reviewApplicationSchema } from "@/lib/validation/schemas";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toActionError } from "@/lib/actions";
import { emptyToNull } from "@/lib/utils";
import type { AllergyInput } from "@/lib/validation/schemas";
import type { ApplicationRow, Json, TenantRow } from "@/lib/supabase/database.types";

/**
 * PUBLIC admission intake.
 *
 * The applicant has no account, so this runs with the service-role client.
 * There is deliberately no `anon` insert policy on `applications`: an open
 * policy would be an unauthenticated write endpoint into every tenant. Instead
 * the tenant is resolved from the slug, the payload is validated, and the
 * write is rate-limited per IP.
 */
export async function submitApplication(
  tenantSlug: string,
  input: z.infer<typeof applicationSchema>,
): Promise<ActionResult> {
  try {
    await enforceRateLimit("admissionSubmit");
    const values = applicationSchema.parse(input);

    const admin = createServiceRoleClient();

    const { data: tenantData } = await admin
      .from("tenants")
      .select("id, name, contact_email, subscription_status")
      .eq("slug", tenantSlug)
      .maybeSingle();

    const tenant = tenantData as Pick<
      TenantRow,
      "id" | "name" | "contact_email" | "subscription_status"
    > | null;

    if (!tenant) return { ok: false, error: "School not found." };

    // A suspended school should not silently accumulate applications it
    // cannot act on.
    if (!["active", "trialing"].includes(tenant.subscription_status)) {
      return { ok: false, error: "This school is not accepting applications right now." };
    }

    const { data: yearData } = await admin
      .from("academic_years")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .maybeSingle();

    const year = yearData as { id: string } | null;
    if (!year) return { ok: false, error: "This school is not accepting applications right now." };

    const { error } = await admin.from("applications").insert({
      tenant_id: tenant.id,
      academic_year_id: year.id,
      child_first_name: values.childFirstName,
      child_last_name: values.childLastName,
      date_of_birth: values.dateOfBirth,
      gender: values.gender ?? null,
      parent_name: values.parentName,
      parent_email: values.parentEmail,
      parent_phone: values.parentPhone,
      address: emptyToNull(values.address),
      allergies: values.allergies as unknown as Json,
      medical_notes: emptyToNull(values.medicalNotes),
      preferred_start: emptyToNull(values.preferredStart),
      message: emptyToNull(values.message),
      status: "pending",
    });
    if (error) throw error;

    // Confirm to the family, and tell the school there is something to review.
    void sendNotification({
      to: { email: values.parentEmail, name: values.parentName },
      kind: "application.received",
      subject: `${tenant.name}: we have your application`,
      text: `Thank you for applying to ${tenant.name}. We have received your application for ${values.childFirstName} and will be in touch soon.`,
    });

    if (tenant.contact_email) {
      void sendNotification({
        to: { email: tenant.contact_email },
        kind: "application.new",
        subject: `New application: ${values.childFirstName} ${values.childLastName}`,
        text: `A new application was submitted by ${values.parentName} (${values.parentEmail}, ${values.parentPhone}).`,
      });
    }

    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Approve an application into a real child record, carrying the allergy
 * information the family gave us straight across — the whole point of asking
 * for it on the form.
 */
export async function reviewApplication(
  tenantSlug: string,
  input: z.infer<typeof reviewApplicationSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "admissions.manage", async ({ ctx, db }) => {
    const values = reviewApplicationSchema.parse(input);

    const { data, error } = await db.selectById("applications", values.applicationId);
    if (error) throw error;
    if (!data) return { ok: false, error: "That application no longer exists." };

    const application = data as ApplicationRow;

    if (values.decision !== "approved") {
      const { error: updateError } = await db.update("applications", application.id, {
        status: values.decision,
        reviewed_by: ctx.profile.id,
        reviewed_at: new Date().toISOString(),
        review_notes: emptyToNull(values.reviewNotes),
      });
      if (updateError) throw updateError;

      revalidatePath(`/${tenantSlug}/admissions`);
      return { ok: true };
    }

    const academicYearId = db.requireActiveYearId();

    const { data: childData, error: childError } = await db
      .insert("children", {
        first_name: application.child_first_name,
        last_name: application.child_last_name,
        date_of_birth: application.date_of_birth,
        gender: application.gender,
        status: "active",
      })
      .select("id")
      .single();
    if (childError) throw childError;

    const childId = (childData as { id: string }).id;

    const allergies = (
      Array.isArray(application.allergies) ? application.allergies : []
    ) as AllergyInput[];

    if (allergies.length > 0) {
      const { error: allergyError } = await db.insert(
        "child_allergies",
        allergies.map((allergy) => ({
          child_id: childId,
          allergen: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
          required_action: allergy.requiredAction,
          medication: emptyToNull(allergy.medication),
          medication_location: emptyToNull(allergy.medicationLocation),
        })),
      );
      if (allergyError) throw allergyError;
    }

    if (application.medical_notes) {
      await db.insert("child_medical_notes", {
        child_id: childId,
        title: "From the admission form",
        details: application.medical_notes,
      });
    }

    await db.insert("emergency_contacts", {
      child_id: childId,
      name: application.parent_name,
      relationship: "Parent",
      phone: application.parent_phone,
      email: application.parent_email,
      priority: 1,
    });

    const { error: enrolError } = await db.insert("enrollments", {
      academic_year_id: academicYearId,
      child_id: childId,
      class_id: emptyToNull(values.classId),
      status: "active",
    });
    if (enrolError) throw enrolError;

    const { error: updateError } = await db.update("applications", application.id, {
      status: "approved",
      reviewed_by: ctx.profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: emptyToNull(values.reviewNotes),
      child_id: childId,
    });
    if (updateError) throw updateError;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "application.review",
      entityType: "application",
      entityId: application.id,
      metadata: { decision: "approved", child_id: childId },
    });

    revalidatePath(`/${tenantSlug}/admissions`);
    revalidatePath(`/${tenantSlug}/children`);
    return { ok: true };
  });
}

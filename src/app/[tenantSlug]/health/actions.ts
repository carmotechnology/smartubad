"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { incidentSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { emptyToNull } from "@/lib/utils";
import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Injuries, illness and medication given. This is a liability record as much
 * as a care record, so it is audited and the parent is emailed by default.
 */
export async function logIncident(
  tenantSlug: string,
  input: z.infer<typeof incidentSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "incidents.write", async ({ ctx, db }) => {
    const values = incidentSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    const { data: child, error: childError } = await db.selectById(
      "children",
      values.childId,
      "id, first_name, last_name",
    );
    if (childError) throw childError;
    if (!child) return { ok: false, error: "That child is not in your care." };

    const { data: enrolment } = await db
      .selectForYear("enrollments", academicYearId, "class_id")
      .eq("child_id", values.childId)
      .maybeSingle();

    const notifiedAt = values.notifyParent ? new Date().toISOString() : null;

    const { data, error } = await db
      .insert("incidents", {
        academic_year_id: academicYearId,
        child_id: values.childId,
        class_id: (enrolment as { class_id: string | null } | null)?.class_id ?? null,
        incident_type: values.incidentType,
        occurred_at: new Date(values.occurredAt).toISOString(),
        location: emptyToNull(values.location),
        description: values.description,
        action_taken: values.actionTaken,
        medication_name: emptyToNull(values.medicationName),
        medication_dose: emptyToNull(values.medicationDose),
        administered_by:
          values.incidentType === "medication" ? ctx.profile.id : null,
        witness: emptyToNull(values.witness),
        parent_notified_at: notifiedAt,
        notified_by: values.notifyParent ? ctx.profile.id : null,
        reported_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "incident.create",
      entityType: "incident",
      entityId: (data as { id: string }).id,
      metadata: { child_id: values.childId, type: values.incidentType },
    });

    if (values.notifyParent) {
      const childName = child as { first_name: string; last_name: string };
      void notifyGuardians(
        db,
        values.childId,
        `${childName.first_name} ${childName.last_name}`,
        ctx.tenant.name,
        values,
      );
    }

    revalidatePath(`/${tenantSlug}/health`);
    return { ok: true };
  });
}

async function notifyGuardians(
  db: import("@/lib/db/scope").TenantScope,
  childId: string,
  childName: string,
  schoolName: string,
  values: z.infer<typeof incidentSchema>,
) {
  try {
    const { data: guardianRows } = await db
      .select("guardians", "profile_id")
      .eq("child_id", childId);

    const profileIds = (guardianRows ?? []).map(
      (row: { profile_id: string }) => row.profile_id,
    );
    if (profileIds.length === 0) return;

    const { data: profiles } = await db
      .select("profiles", "email, full_name, locale")
      .in("id", profileIds);

    await Promise.all(
      ((profiles ?? []) as Pick<ProfileRow, "email" | "full_name" | "locale">[]).map(
        (parent) =>
          sendNotification({
            to: { email: parent.email, name: parent.full_name, locale: parent.locale },
            kind: "incident",
            subject: `${schoolName}: a note about ${childName}`,
            text: [
              `Dear parent,`,
              "",
              `We are letting you know about something that happened at ${schoolName} today.`,
              "",
              `What happened: ${values.description}`,
              `What we did: ${values.actionTaken}`,
              values.medicationName ? `Medication given: ${values.medicationName}` : "",
              "",
              "Please speak to us at pickup if you have any questions.",
            ]
              .filter(Boolean)
              .join("\n"),
          }),
      ),
    );
  } catch (error) {
    console.error("[incidents] parent notification failed", error);
  }
}

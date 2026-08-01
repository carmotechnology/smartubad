"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { saveAttendanceSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";
import { ForbiddenError } from "@/lib/auth/errors";

/**
 * Save a class register for one day.
 *
 * Written as a single upsert keyed on (child_id, attendance_date), so a
 * teacher re-saving after checking a few children out updates rather than
 * duplicating — and a flaky phone connection retrying is harmless.
 */
export async function saveAttendance(
  tenantSlug: string,
  input: z.infer<typeof saveAttendanceSchema>,
): Promise<ActionResult<{ saved: number }>> {
  return withTenantWrite(tenantSlug, "attendance.record", async ({ ctx, db }) => {
    const values = saveAttendanceSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    // A teacher may only register a class they actually teach. RLS enforces
    // this per row too; failing here gives a clear message instead of a
    // silent zero-row write.
    if (ctx.role === "teacher") {
      const { data, error } = await db
        .select("class_teachers", "id")
        .eq("class_id", values.classId)
        .eq("profile_id", ctx.profile.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ForbiddenError("You are not assigned to that class.");
    }

    // Only accept children actually enrolled in this class this year, so a
    // tampered payload cannot write a register entry for another class.
    const { data: enrolled, error: enrolError } = await db
      .selectForYear("enrollments", academicYearId, "child_id")
      .eq("class_id", values.classId)
      .eq("status", "active");
    if (enrolError) throw enrolError;

    const allowed = new Set(
      (enrolled ?? []).map((row: { child_id: string }) => row.child_id),
    );
    const entries = values.entries.filter((entry) => allowed.has(entry.childId));

    if (entries.length === 0) {
      return { ok: false, error: "No children in this class to save." };
    }

    const { error } = await db.upsert(
      "attendance_records",
      entries.map((entry) => ({
        academic_year_id: academicYearId,
        child_id: entry.childId,
        class_id: values.classId,
        attendance_date: values.date,
        status: entry.status,
        check_in_at: entry.checkInAt ?? null,
        check_out_at: entry.checkOutAt ?? null,
        dropped_off_by: emptyToNull(entry.droppedOffBy),
        picked_up_by: emptyToNull(entry.pickedUpBy),
        notes: emptyToNull(entry.notes),
        recorded_by: ctx.profile.id,
      })),
      { onConflict: "child_id,attendance_date" },
    );
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "attendance.record",
      entityType: "class",
      entityId: values.classId,
      metadata: { date: values.date, entries: entries.length },
    });

    revalidatePath(`/${tenantSlug}/attendance`);
    return { ok: true, data: { saved: entries.length } };
  });
}

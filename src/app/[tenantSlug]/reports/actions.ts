"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { dailyReportSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Daily reports. Keyed on (child_id, report_date) so a teacher editing
 * through the day updates one row rather than creating a trail of drafts.
 */
export async function saveDailyReport(
  tenantSlug: string,
  input: z.infer<typeof dailyReportSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "reports.write", async ({ ctx, db }) => {
    const values = dailyReportSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    // The child must be one this user can see. RLS enforces it on write too;
    // this makes the failure legible instead of a silent no-op.
    const { data: child, error: childError } = await db.selectById(
      "children",
      values.childId,
      "id",
    );
    if (childError) throw childError;
    if (!child) return { ok: false, error: "That child is not in your care." };

    const { data: enrolment } = await db
      .selectForYear("enrollments", academicYearId, "class_id")
      .eq("child_id", values.childId)
      .maybeSingle();

    const { error } = await db.upsert(
      "daily_reports",
      {
        academic_year_id: academicYearId,
        child_id: values.childId,
        class_id: (enrolment as { class_id: string | null } | null)?.class_id ?? null,
        report_date: values.date,
        mood: values.mood ?? null,
        meals: values.meals as unknown as Json,
        naps: values.naps as unknown as Json,
        activities: emptyToNull(values.activities),
        notes: emptyToNull(values.notes),
        toileting: emptyToNull(values.toileting),
        is_published: values.publish,
        published_at: values.publish ? new Date().toISOString() : null,
        created_by: ctx.profile.id,
      },
      { onConflict: "child_id,report_date" },
    );
    if (error) throw error;

    if (values.publish) {
      await recordAudit({
        tenantId: ctx.tenantId,
        actorId: ctx.profile.id,
        actorEmail: ctx.profile.email,
        action: "report.publish",
        entityType: "child",
        entityId: values.childId,
        metadata: { date: values.date },
      });
    }

    revalidatePath(`/${tenantSlug}/reports`);
    return { ok: true };
  });
}

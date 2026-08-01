"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { calendarEventSchema } from "@/lib/validation/schemas";
import { emptyToNull } from "@/lib/utils";

export async function createEvent(
  tenantSlug: string,
  input: z.infer<typeof calendarEventSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "calendar.manage", async ({ ctx, db }) => {
    const values = calendarEventSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    const { error } = await db.insert("calendar_events", {
      academic_year_id: academicYearId,
      class_id: emptyToNull(values.classId),
      title: values.title,
      description: emptyToNull(values.description),
      event_type: values.eventType,
      starts_at: new Date(values.startsAt).toISOString(),
      ends_at: values.endsAt ? new Date(values.endsAt).toISOString() : null,
      all_day: values.allDay,
      location: emptyToNull(values.location),
      visible_to_parents: values.visibleToParents,
      created_by: ctx.profile.id,
    });
    if (error) throw error;

    revalidatePath(`/${tenantSlug}/calendar`);
    return { ok: true };
  });
}

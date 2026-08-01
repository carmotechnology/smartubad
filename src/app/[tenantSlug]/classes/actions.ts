"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { classSchema } from "@/lib/validation/schemas";
import { emptyToNull } from "@/lib/utils";
import { ForbiddenError } from "@/lib/auth/errors";

export async function createClass(
  tenantSlug: string,
  input: z.infer<typeof classSchema>,
): Promise<ActionResult<{ classId: string }>> {
  return withTenantWrite(tenantSlug, "classes.manage", async ({ db }) => {
    const values = classSchema.parse(input);
    // Classes belong to the ACTIVE year only — a closed year is history.
    const academicYearId = db.requireActiveYearId();

    const { data, error } = await db
      .insert("classes", {
        academic_year_id: academicYearId,
        name: values.name,
        room: emptyToNull(values.room),
        capacity: values.capacity,
        age_range: emptyToNull(values.ageRange),
        colour: emptyToNull(values.colour),
      })
      .select("id")
      .single();

    if (error) throw error;
    const classId = (data as { id: string }).id;

    if (values.teacherIds.length > 0) {
      const { data: staff, error: staffError } = await db
        .select("profiles", "id")
        .in("id", values.teacherIds)
        .in("role", ["owner", "admin", "teacher"]);
      if (staffError) throw staffError;

      const valid = new Set((staff ?? []).map((row: { id: string }) => row.id));
      if (values.teacherIds.some((id) => !valid.has(id))) {
        throw new ForbiddenError("One of those staff members is not part of this school.");
      }

      const { error: linkError } = await db.insert(
        "class_teachers",
        values.teacherIds.map((profileId, index) => ({
          class_id: classId,
          profile_id: profileId,
          is_lead: index === 0,
        })),
      );
      if (linkError) throw linkError;
    }

    revalidatePath(`/${tenantSlug}/classes`);
    return { ok: true, data: { classId } };
  });
}

export async function assignChildToClass(
  tenantSlug: string,
  childId: string,
  classId: string | null,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "children.manage", async ({ db }) => {
    const academicYearId = db.requireActiveYearId();

    const { error } = await db.upsert(
      "enrollments",
      {
        academic_year_id: academicYearId,
        child_id: childId,
        class_id: classId,
        status: "active",
      },
      { onConflict: "child_id,academic_year_id" },
    );
    if (error) throw error;

    revalidatePath(`/${tenantSlug}/classes`);
    revalidatePath(`/${tenantSlug}/children/${childId}`);
    return { ok: true };
  });
}

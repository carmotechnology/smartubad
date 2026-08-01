"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { announcementSchema } from "@/lib/validation/schemas";
import { sendNotification } from "@/lib/notifications";
import { ForbiddenError } from "@/lib/auth/errors";
import type { TenantScope } from "@/lib/db/scope";
import type { ProfileRow } from "@/lib/supabase/database.types";

export async function postAnnouncement(
  tenantSlug: string,
  input: z.infer<typeof announcementSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "announcements.view", async ({ ctx, db }) => {
    const values = announcementSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    // A teacher may post to their own class only; school-wide and staff-only
    // announcements are an administrator's call.
    if (ctx.role === "teacher") {
      if (values.audience !== "class") {
        throw new ForbiddenError("Teachers can post announcements to their own class only.");
      }
      const { data, error } = await db
        .select("class_teachers", "id")
        .eq("class_id", values.classId)
        .eq("profile_id", ctx.profile.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ForbiddenError("You are not assigned to that class.");
    } else if (ctx.role === "parent") {
      throw new ForbiddenError();
    }

    const { error } = await db.insert("announcements", {
      academic_year_id: academicYearId,
      audience: values.audience,
      class_id: values.audience === "class" ? values.classId || null : null,
      title: values.title,
      body: values.body,
      is_pinned: values.isPinned,
      published_at: new Date().toISOString(),
      created_by: ctx.profile.id,
    });
    if (error) throw error;

    // Email notification. Fire-and-forget: a mail outage must not fail the
    // post, and the announcement is visible in-app regardless.
    if (values.audience !== "staff") {
      void notifyAudience(db, values.title, values.body, ctx.tenant.name);
    }

    revalidatePath(`/${tenantSlug}/announcements`);
    return { ok: true };
  });
}

async function notifyAudience(
  db: TenantScope,
  title: string,
  body: string,
  schoolName: string,
) {
  try {
    const { data } = await db.select("profiles", "email, full_name, locale").eq("role", "parent");
    const parents = (data ?? []) as Pick<ProfileRow, "email" | "full_name" | "locale">[];

    await Promise.all(
      parents.map((parent) =>
        sendNotification({
          to: { email: parent.email, name: parent.full_name, locale: parent.locale },
          kind: "announcement",
          subject: `${schoolName}: ${title}`,
          text: `${title}\n\n${body}`,
        }),
      ),
    );
  } catch (error) {
    console.error("[announcements] notification fan-out failed", error);
  }
}

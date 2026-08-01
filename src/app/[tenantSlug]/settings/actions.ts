"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { academicYearSchema, updateTenantSettingsSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";

/**
 * School-admin settings.
 *
 * Note what is absent: slug, plan and subscription_status. Those are the
 * super-admin's, and the `app.guard_tenant_privileges` trigger rejects them
 * even if a payload somehow reached the database with them attached.
 */
export async function updateTenantSettings(
  tenantSlug: string,
  input: z.infer<typeof updateTenantSettingsSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "tenant.edit_branding", async ({ ctx }) => {
    const values = updateTenantSettingsSchema.parse(input);

    const { error } = await ctx.supabase
      .from("tenants")
      .update({
        name: values.name,
        tagline: emptyToNull(values.tagline),
        accent_color: emptyToNull(values.accentColor),
        address: emptyToNull(values.address),
        city: emptyToNull(values.city),
        country: emptyToNull(values.country),
        phone: emptyToNull(values.phone),
        contact_email: emptyToNull(values.contactEmail),
        website: emptyToNull(values.website),
        timezone: values.timezone,
        locale: values.locale,
        currency: values.currency,
      })
      .eq("id", ctx.tenantId);
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "tenant.update",
      entityType: "tenant",
      entityId: ctx.tenantId,
    });

    revalidatePath(`/${tenantSlug}/settings`);
    return { ok: true };
  });
}

export async function createAcademicYear(
  tenantSlug: string,
  input: z.infer<typeof academicYearSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "academic_year.manage", async ({ ctx, db }) => {
    const values = academicYearSchema.parse(input);

    // A partial unique index enforces one active year per tenant, so stand
    // the current one down first rather than letting the insert collide.
    if (values.makeActive) {
      const { error: clearError } = await ctx.supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true);
      if (clearError) throw clearError;
    }

    const { error } = await db.insert("academic_years", {
      name: values.name,
      start_date: values.startDate,
      end_date: values.endDate,
      is_active: values.makeActive,
    });
    if (error) throw error;

    revalidatePath(`/${tenantSlug}/settings`);
    revalidatePath(`/${tenantSlug}`);
    return { ok: true };
  });
}

/**
 * Switch the active year. The previous year is not deleted or altered — it
 * becomes read-only history, which is what `TenantScope.assertYearWritable`
 * then enforces on every year-bound write.
 */
export async function setActiveAcademicYear(
  tenantSlug: string,
  academicYearId: string,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "academic_year.manage", async ({ ctx, db }) => {
    const { data, error: findError } = await db.selectById(
      "academic_years",
      academicYearId,
      "id",
    );
    if (findError) throw findError;
    if (!data) return { ok: false, error: "That academic year does not exist." };

    const { error: clearError } = await ctx.supabase
      .from("academic_years")
      .update({ is_active: false })
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true);
    if (clearError) throw clearError;

    const { error } = await db.update("academic_years", academicYearId, { is_active: true });
    if (error) throw error;

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true };
  });
}

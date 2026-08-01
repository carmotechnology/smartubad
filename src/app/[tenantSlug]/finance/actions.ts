"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withTenantWrite, type ActionResult } from "@/lib/actions";
import { feePaymentSchema, feeSchema, transactionSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/utils";
import type { FeeRow } from "@/lib/supabase/database.types";

/**
 * Finance. Amounts arrive as decimals from the form and are stored as integer
 * minor units by the Zod transform — no floating-point money anywhere.
 *
 * There is no payment processor in v1: an admin records what was actually
 * received (cash, mobile money, bank). The fee → payments shape is already
 * what a processor webhook would write into later.
 */

export async function createFee(
  tenantSlug: string,
  // `z.input`, not `z.infer`: the schema *transforms* a decimal string into
  // integer minor units, so callers pass what the form produces.
  input: z.input<typeof feeSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "finance.manage", async ({ ctx, db }) => {
    const values = feeSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    const { data, error } = await db
      .insert("fees", {
        academic_year_id: academicYearId,
        term_id: emptyToNull(values.termId),
        child_id: values.childId,
        description: values.description,
        amount_minor: values.amount,
        currency: ctx.tenant.currency,
        due_date: emptyToNull(values.dueDate),
        notes: emptyToNull(values.notes),
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "fee.create",
      entityType: "fee",
      entityId: (data as { id: string }).id,
      metadata: { amount_minor: values.amount, child_id: values.childId },
    });

    revalidatePath(`/${tenantSlug}/finance`);
    return { ok: true };
  });
}

export async function recordPayment(
  tenantSlug: string,
  input: z.input<typeof feePaymentSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "finance.manage", async ({ ctx, db }) => {
    const values = feePaymentSchema.parse(input);

    // Confirm the fee is this tenant's before writing against it.
    const { data: fee, error: feeError } = await db.selectById("fees", values.feeId);
    if (feeError) throw feeError;
    if (!fee) return { ok: false, error: "That fee no longer exists." };

    const { error } = await db.insert("fee_payments", {
      fee_id: values.feeId,
      amount_minor: values.amount,
      paid_on: values.paidOn,
      method: values.method,
      reference: emptyToNull(values.reference),
      notes: emptyToNull(values.notes),
      recorded_by: ctx.profile.id,
    });
    if (error) throw error;

    // Mirror the payment into the ledger so the income figure on the
    // dashboard reflects money actually received.
    const { error: txError } = await db.insert("transactions", {
      academic_year_id: (fee as FeeRow).academic_year_id,
      kind: "income",
      category: "tuition",
      description: (fee as FeeRow).description,
      amount_minor: values.amount,
      currency: ctx.tenant.currency,
      occurred_on: values.paidOn,
      recorded_by: ctx.profile.id,
    });
    if (txError) throw txError;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "fee.payment",
      entityType: "fee",
      entityId: values.feeId,
      metadata: { amount_minor: values.amount, method: values.method },
    });

    revalidatePath(`/${tenantSlug}/finance`);
    return { ok: true };
  });
}

export async function createTransaction(
  tenantSlug: string,
  input: z.input<typeof transactionSchema>,
): Promise<ActionResult> {
  return withTenantWrite(tenantSlug, "finance.manage", async ({ ctx, db }) => {
    const values = transactionSchema.parse(input);
    const academicYearId = db.requireActiveYearId();

    const { error } = await db.insert("transactions", {
      academic_year_id: academicYearId,
      kind: values.kind,
      category: values.category,
      description: emptyToNull(values.description),
      amount_minor: values.amount,
      currency: ctx.tenant.currency,
      occurred_on: values.occurredOn,
      recorded_by: ctx.profile.id,
    });
    if (error) throw error;

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.profile.id,
      actorEmail: ctx.profile.email,
      action: "transaction.create",
      metadata: { kind: values.kind, amount_minor: values.amount },
    });

    revalidatePath(`/${tenantSlug}/finance`);
    return { ok: true };
  });
}

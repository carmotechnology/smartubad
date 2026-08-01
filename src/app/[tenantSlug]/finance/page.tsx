import { Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatDate, formatMoney, todayInTimezone } from "@/lib/utils";
import { createFee, createTransaction, recordPayment } from "./actions";
import type { FeeRow, TransactionRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Finance" };

export default async function FinancePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  if (!ctx.activeYear) {
    return (
      <>
        <PageHeader title={t.finance.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const isAdmin = can(ctx.role, "finance.manage");
  const canWrite = isAdmin && ctx.canWrite;
  const currency = ctx.tenant.currency;
  const locale = ctx.tenant.locale;
  const today = todayInTimezone(ctx.tenant.timezone);

  // Parents reach this page too. RLS narrows `fees` to their own children and
  // blocks `transactions` entirely, so the same query is safe for both roles.
  const [feesResult, txResult, children] = await Promise.all([
    db.selectForYear("fees", ctx.activeYear.id).order("due_date", { ascending: true }),
    isAdmin
      ? db
          .selectForYear("transactions", ctx.activeYear.id)
          .order("occurred_on", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
    canWrite ? listChildrenWithSafety(db) : Promise.resolve([]),
  ]);

  const fees = (feesResult.data ?? []) as FeeRow[];
  const transactions = (txResult.data ?? []) as TransactionRow[];
  const childNames = new Map(children.map((child) => [child.id, childDisplayName(child)]));

  const outstanding = fees
    .filter((fee) => fee.status !== "waived")
    .reduce((sum, fee) => sum + Math.max(0, fee.amount_minor - fee.paid_minor), 0);
  const income = transactions
    .filter((tx) => tx.kind === "income")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);
  const expenses = transactions
    .filter((tx) => tx.kind === "expense")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);

  async function addFee(formData: FormData) {
    "use server";
    await createFee(tenantSlug, {
      childId: String(formData.get("childId") ?? ""),
      termId: "",
      description: String(formData.get("description") ?? ""),
      amount: String(formData.get("amount") ?? "0"),
      dueDate: String(formData.get("dueDate") ?? ""),
      notes: "",
    });
  }

  async function addPayment(formData: FormData) {
    "use server";
    await recordPayment(tenantSlug, {
      feeId: String(formData.get("feeId") ?? ""),
      amount: String(formData.get("amount") ?? "0"),
      paidOn: String(formData.get("paidOn") ?? ""),
      method: (formData.get("method") as "cash") ?? "cash",
      reference: "",
      notes: "",
    });
  }

  async function addTransaction(formData: FormData) {
    "use server";
    await createTransaction(tenantSlug, {
      kind: (formData.get("kind") as "expense") ?? "expense",
      category: String(formData.get("category") ?? "general"),
      description: String(formData.get("description") ?? ""),
      amount: String(formData.get("amount") ?? "0"),
      occurredOn: String(formData.get("occurredOn") ?? ""),
    });
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? t.finance.title : t.finance.myChildFees}
        description={ctx.activeYear.name}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.finance.outstanding}
          value={formatMoney(outstanding, currency, locale)}
          tone={outstanding > 0 ? "warning" : "success"}
          icon={<Wallet />}
        />
        {isAdmin ? (
          <>
            <StatCard
              label={t.finance.income}
              value={formatMoney(income, currency, locale)}
              tone="success"
            />
            <StatCard
              label={t.finance.expenses}
              value={formatMoney(expenses, currency, locale)}
            />
            <StatCard
              label={t.finance.net}
              value={formatMoney(income - expenses, currency, locale)}
              tone={income - expenses >= 0 ? "success" : "danger"}
            />
          </>
        ) : null}
      </div>

      {canWrite ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.finance.addFee}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addFee} className="space-y-3">
                <Field label={t.children.title} htmlFor="fee-child">
                  <Select id="fee-child" name="childId" required>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {childDisplayName(child)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.finance.description} htmlFor="fee-description">
                  <Input id="fee-description" name="description" required placeholder="Term 1 tuition" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={`${t.finance.amount} (${currency})`} htmlFor="fee-amount">
                    <Input id="fee-amount" name="amount" type="number" step="0.01" min="0" required />
                  </Field>
                  <Field label={t.finance.dueDate} hint={t.common.optional} htmlFor="fee-due">
                    <Input id="fee-due" name="dueDate" type="date" />
                  </Field>
                </div>
                <Button type="submit">{t.finance.addFee}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.finance.addTransaction}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addTransaction} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.health.incidentType} htmlFor="tx-kind">
                    <Select id="tx-kind" name="kind" defaultValue="expense">
                      <option value="expense">{t.finance.expenses}</option>
                      <option value="income">{t.finance.income}</option>
                    </Select>
                  </Field>
                  <Field label={t.finance.category} htmlFor="tx-category">
                    <Input id="tx-category" name="category" defaultValue="general" required />
                  </Field>
                  <Field label={`${t.finance.amount} (${currency})`} htmlFor="tx-amount">
                    <Input id="tx-amount" name="amount" type="number" step="0.01" min="0" required />
                  </Field>
                  <Field label={t.finance.date} htmlFor="tx-date">
                    <Input id="tx-date" name="occurredOn" type="date" defaultValue={today} required />
                  </Field>
                </div>
                <Field label={t.finance.description} hint={t.common.optional} htmlFor="tx-desc">
                  <Input id="tx-desc" name="description" />
                </Field>
                <Button type="submit">{t.finance.addTransaction}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {fees.length === 0 ? (
        <EmptyState icon={<Wallet />} title={t.finance.noFees} description={t.finance.noFeesBody} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.finance.fees}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {fees.map((fee) => {
                const remaining = Math.max(0, fee.amount_minor - fee.paid_minor);
                return (
                  <li
                    key={fee.id}
                    className="space-y-2 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{fee.description}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {childNames.get(fee.child_id) ?? ""}
                          {fee.due_date ? ` · ${formatDate(fee.due_date, locale)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatMoney(fee.amount_minor, fee.currency, locale)}
                        </span>
                        <Badge
                          variant={
                            fee.status === "paid"
                              ? "success"
                              : fee.status === "partial"
                                ? "warning"
                                : fee.status === "waived"
                                  ? "muted"
                                  : "destructive"
                          }
                        >
                          {t.finance[fee.status]}
                        </Badge>
                      </div>
                    </div>

                    {canWrite && remaining > 0 ? (
                      <form action={addPayment} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="feeId" value={fee.id} />
                        <Input
                          name="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          defaultValue={(remaining / 100).toFixed(2)}
                          aria-label={t.finance.amount}
                          className="w-32"
                          required
                        />
                        <Input
                          name="paidOn"
                          type="date"
                          defaultValue={today}
                          aria-label={t.finance.date}
                          className="w-40"
                          required
                        />
                        <Select name="method" defaultValue="cash" aria-label={t.finance.method} className="w-40">
                          <option value="cash">{t.finance.methods.cash}</option>
                          <option value="mobile_money">{t.finance.methods.mobile_money}</option>
                          <option value="bank">{t.finance.methods.bank}</option>
                          <option value="other">{t.finance.methods.other}</option>
                        </Select>
                        <Button type="submit" size="sm" variant="secondary">
                          {t.finance.recordPayment}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

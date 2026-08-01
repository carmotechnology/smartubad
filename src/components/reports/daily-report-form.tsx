"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { saveDailyReport } from "@/app/[tenantSlug]/reports/actions";
import type { DailyReportInput } from "@/lib/validation/schemas";

const MEAL_TYPES = ["breakfast", "snack_am", "lunch", "snack_pm"] as const;
const MEAL_AMOUNTS = ["none", "some", "most", "all"] as const;

export function DailyReportForm({
  tenantSlug,
  today,
  childrenOptions,
}: {
  tenantSlug: string;
  today: string;
  childrenOptions: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [meals, setMeals] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);

    const napFrom = String(form.get("napFrom") ?? "");
    const napTo = String(form.get("napTo") ?? "");

    const input: DailyReportInput = {
      childId: String(form.get("childId") ?? ""),
      date: String(form.get("date") ?? today),
      mood: (form.get("mood") as DailyReportInput["mood"]) || undefined,
      meals: Object.entries(meals)
        .filter(([, amount]) => amount)
        .map(([type, amount]) => ({
          type: type as (typeof MEAL_TYPES)[number],
          amount: amount as (typeof MEAL_AMOUNTS)[number],
          note: "",
        })),
      naps: napFrom && napTo ? [{ from: napFrom, to: napTo }] : [],
      activities: String(form.get("activities") ?? ""),
      notes: String(form.get("notes") ?? ""),
      toileting: String(form.get("toileting") ?? ""),
      publish: form.get("publish") !== null,
    };

    const result = await saveDailyReport(tenantSlug, input);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(t.common.saved);
    (event.target as HTMLFormElement).reset();
    setMeals({});
    router.refresh();
  }

  if (childrenOptions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.reports.newReport}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.children.title} htmlFor="report-child">
              <Select id="report-child" name="childId" required>
                {childrenOptions.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t.finance.date} htmlFor="report-date">
              <Input id="report-date" name="date" type="date" defaultValue={today} required />
            </Field>

            <Field label={t.reports.mood} hint={t.common.optional} htmlFor="report-mood">
              <Select id="report-mood" name="mood" defaultValue="">
                <option value="">{t.common.notSet}</option>
                <option value="happy">{t.reports.moods.happy}</option>
                <option value="calm">{t.reports.moods.calm}</option>
                <option value="tired">{t.reports.moods.tired}</option>
                <option value="upset">{t.reports.moods.upset}</option>
                <option value="unwell">{t.reports.moods.unwell}</option>
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.reports.meals}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MEAL_TYPES.map((mealType) => (
                <label key={mealType} className="space-y-1 text-sm">
                  <span className="block text-[var(--muted-foreground)]">
                    {t.reports.mealTypes[mealType]}
                  </span>
                  <Select
                    value={meals[mealType] ?? ""}
                    onChange={(event) =>
                      setMeals((current) => ({ ...current, [mealType]: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {MEAL_AMOUNTS.map((amount) => (
                      <option key={amount} value={amount}>
                        {t.reports.mealAmounts[amount]}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`${t.reports.naps} — ${t.calendar.starts}`} htmlFor="nap-from">
              <Input id="nap-from" name="napFrom" type="time" />
            </Field>
            <Field label={`${t.reports.naps} — ${t.calendar.ends}`} htmlFor="nap-to">
              <Input id="nap-to" name="napTo" type="time" />
            </Field>
            <Field label={t.reports.toileting} hint={t.common.optional} htmlFor="toileting">
              <Input id="toileting" name="toileting" />
            </Field>
          </div>

          <Field label={t.reports.activities} hint={t.common.optional} htmlFor="activities">
            <Textarea id="activities" name="activities" rows={2} />
          </Field>

          <Field label={t.reports.notes} hint={t.common.optional} htmlFor="report-notes">
            <Textarea id="report-notes" name="notes" rows={2} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" defaultChecked className="size-4" />
            {t.reports.publish}
          </label>

          <Button type="submit" disabled={pending}>
            <Save aria-hidden />
            {pending ? t.common.saving : t.common.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

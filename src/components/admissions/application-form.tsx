"use client";

import * as React from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { useI18n } from "@/components/i18n-provider";
import { submitApplication } from "@/app/[tenantSlug]/admissions/actions";
import type { AllergyInput } from "@/lib/validation/schemas";

const EMPTY_ALLERGY: AllergyInput = {
  allergen: "",
  severity: "moderate",
  reaction: "",
  requiredAction: "",
  medication: "",
  medicationLocation: "",
  notes: "",
};

export function ApplicationForm({ tenantSlug }: { tenantSlug: string }) {
  const { t } = useI18n();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [allergies, setAllergies] = React.useState<AllergyInput[]>([]);

  function updateAllergy(index: number, patch: Partial<AllergyInput>) {
    setAllergies((current) =>
      current.map((allergy, i) => (i === index ? { ...allergy, ...patch } : allergy)),
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await submitApplication(tenantSlug, {
      childFirstName: String(form.get("childFirstName") ?? ""),
      childLastName: String(form.get("childLastName") ?? ""),
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
      gender: (form.get("gender") as "male") || undefined,
      parentName: String(form.get("parentName") ?? ""),
      parentEmail: String(form.get("parentEmail") ?? ""),
      parentPhone: String(form.get("parentPhone") ?? ""),
      address: String(form.get("address") ?? ""),
      allergies: allergies.filter((allergy) => allergy.allergen.trim().length > 0),
      medicalNotes: String(form.get("medicalNotes") ?? ""),
      preferredStart: String(form.get("preferredStart") ?? ""),
      message: String(form.get("message") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <Alert tone="success" icon={<CheckCircle2 />} title={t.admissions.submitted}>
        {t.admissions.submittedBody}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? <Alert role="alert" tone="danger" title={error} /> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t.admissions.childDetails}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.children.firstName} htmlFor="childFirstName">
            <Input id="childFirstName" name="childFirstName" required />
          </Field>
          <Field label={t.children.lastName} htmlFor="childLastName">
            <Input id="childLastName" name="childLastName" required />
          </Field>
          <Field label={t.children.dateOfBirth} htmlFor="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
          </Field>
          <Field label={t.children.gender} hint={t.common.optional} htmlFor="gender">
            <Select id="gender" name="gender" defaultValue="">
              <option value="">{t.common.notSet}</option>
              <option value="male">{t.children.genders.male}</option>
              <option value="female">{t.children.genders.female}</option>
              <option value="other">{t.children.genders.other}</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t.admissions.parentDetails}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.staff.name} htmlFor="parentName">
            <Input id="parentName" name="parentName" required autoComplete="name" />
          </Field>
          <Field label={t.staff.email} htmlFor="parentEmail">
            <Input id="parentEmail" name="parentEmail" type="email" required autoComplete="email" />
          </Field>
          <Field label={t.settings.phone} htmlFor="parentPhone">
            <Input id="parentPhone" name="parentPhone" type="tel" required autoComplete="tel" />
          </Field>
          <Field label={t.settings.address} hint={t.common.optional} htmlFor="address">
            <Input id="address" name="address" autoComplete="street-address" />
          </Field>
        </div>
      </fieldset>

      {/* Asked for up front, before the first day — the whole reason this
          section is on the public form rather than a later admin task. */}
      <fieldset className="space-y-4 rounded-xl border-2 border-[color-mix(in_oklch,var(--destructive)_25%,transparent)] p-4">
        <legend className="px-1 text-sm font-semibold">{t.admissions.healthSection}</legend>
        <p className="text-sm text-[var(--muted-foreground)]">{t.admissions.healthHelp}</p>

        {allergies.map((allergy, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.allergies.allergen}>
                <Input
                  value={allergy.allergen}
                  onChange={(event) => updateAllergy(index, { allergen: event.target.value })}
                  placeholder="Peanuts"
                />
              </Field>
              <Field label={t.allergies.severity}>
                <Select
                  value={allergy.severity}
                  onChange={(event) =>
                    updateAllergy(index, {
                      severity: event.target.value as AllergyInput["severity"],
                    })
                  }
                >
                  <option value="mild">{t.allergies.severities.mild}</option>
                  <option value="moderate">{t.allergies.severities.moderate}</option>
                  <option value="severe">{t.allergies.severities.severe}</option>
                </Select>
              </Field>
            </div>
            <Field label={t.allergies.reaction}>
              <Input
                value={allergy.reaction}
                onChange={(event) => updateAllergy(index, { reaction: event.target.value })}
              />
            </Field>
            <Field label={t.allergies.requiredAction}>
              <Textarea
                value={allergy.requiredAction}
                onChange={(event) =>
                  updateAllergy(index, { requiredAction: event.target.value })
                }
                rows={2}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAllergies((current) => current.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden />
              {t.common.delete}
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => setAllergies((current) => [...current, { ...EMPTY_ALLERGY }])}
        >
          <Plus aria-hidden />
          {t.allergies.addAllergy}
        </Button>

        <Field label={t.allergies.medicalNotes} hint={t.common.optional} htmlFor="medicalNotes">
          <Textarea id="medicalNotes" name="medicalNotes" rows={3} />
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.admissions.preferredStart}
          hint={t.common.optional}
          htmlFor="preferredStart"
        >
          <Input id="preferredStart" name="preferredStart" type="date" />
        </Field>
      </div>

      <Field label={t.announcements.body} hint={t.common.optional} htmlFor="message">
        <Textarea id="message" name="message" rows={3} />
      </Field>

      <Button type="submit" size="touch" disabled={pending}>
        {pending ? t.common.saving : t.admissions.submit}
      </Button>
    </form>
  );
}

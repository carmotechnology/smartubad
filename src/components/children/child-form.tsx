"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { createChild } from "@/app/[tenantSlug]/children/actions";
import type { AllergyInput, ChildInput } from "@/lib/validation/schemas";

type ClassOption = { id: string; name: string };

const EMPTY_ALLERGY: AllergyInput = {
  allergen: "",
  severity: "moderate",
  reaction: "",
  requiredAction: "",
  medication: "",
  medicationLocation: "",
  notes: "",
};

export function ChildForm({
  tenantSlug,
  classes,
}: {
  tenantSlug: string;
  classes: ClassOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
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
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const input: ChildInput = {
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      preferredName: String(form.get("preferredName") ?? ""),
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
      gender: (form.get("gender") as ChildInput["gender"]) || undefined,
      status: (form.get("status") as ChildInput["status"]) || "active",
      classId: String(form.get("classId") ?? ""),
      notes: String(form.get("notes") ?? ""),
      // Drop half-filled rows rather than failing the whole submit on them.
      allergies: allergies.filter((allergy) => allergy.allergen.trim().length > 0),
      emergencyContacts: [
        {
          name: String(form.get("contactName") ?? ""),
          relationship: String(form.get("contactRelationship") ?? ""),
          phone: String(form.get("contactPhone") ?? ""),
          email: "",
          priority: 1,
        },
      ].filter((contact) => contact.name && contact.phone),
    };

    const result = await createChild(tenantSlug, input);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }

    toast.success(t.common.saved);
    router.push(`/${tenantSlug}/children/${result.data?.childId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <Alert role="alert" tone="danger" title={error} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.children.addChild}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.children.firstName}
            htmlFor="firstName"
            error={fieldErrors.firstName?.[0]}
          >
            <Input id="firstName" name="firstName" required autoComplete="off" />
          </Field>

          <Field
            label={t.children.lastName}
            htmlFor="lastName"
            error={fieldErrors.lastName?.[0]}
          >
            <Input id="lastName" name="lastName" required autoComplete="off" />
          </Field>

          <Field
            label={t.children.preferredName}
            hint={t.common.optional}
            htmlFor="preferredName"
          >
            <Input id="preferredName" name="preferredName" autoComplete="off" />
          </Field>

          <Field
            label={t.children.dateOfBirth}
            htmlFor="dateOfBirth"
            error={fieldErrors.dateOfBirth?.[0]}
          >
            <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
          </Field>

          <Field label={t.children.gender} hint={t.common.optional} htmlFor="gender">
            <Select id="gender" name="gender" defaultValue="">
              <option value="">{t.common.notSet}</option>
              <option value="male">{t.children.genders.male}</option>
              <option value="female">{t.children.genders.female}</option>
              <option value="other">{t.children.genders.other}</option>
              <option value="undisclosed">{t.children.genders.undisclosed}</option>
            </Select>
          </Field>

          <Field label={t.children.status} htmlFor="status">
            <Select id="status" name="status" defaultValue="active">
              <option value="active">{t.children.statuses.active}</option>
              <option value="waitlist">{t.children.statuses.waitlist}</option>
            </Select>
          </Field>

          <Field label={t.children.class} hint={t.common.optional} htmlFor="classId">
            <Select id="classId" name="classId" defaultValue="">
              <option value="">{t.common.notSet}</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.children.emergencyContacts}</CardTitle>
          <CardDescription>{t.common.optional}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label={t.staff.name} htmlFor="contactName">
            <Input id="contactName" name="contactName" autoComplete="off" />
          </Field>
          <Field label={t.children.parents} htmlFor="contactRelationship">
            <Input
              id="contactRelationship"
              name="contactRelationship"
              placeholder="Mother"
              autoComplete="off"
            />
          </Field>
          <Field label={t.settings.phone} htmlFor="contactPhone">
            <Input id="contactPhone" name="contactPhone" type="tel" autoComplete="off" />
          </Field>
        </CardContent>
      </Card>

      {/* Allergies are part of creating a child, not an afterthought behind
          a second screen someone may never open. */}
      <Card className="border-[color-mix(in_oklch,var(--destructive)_30%,transparent)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-[var(--destructive)]" aria-hidden />
            {t.allergies.title}
          </CardTitle>
          <CardDescription>{t.admissions.healthHelp}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allergies.map((allergy, index) => (
            <div
              key={index}
              className="space-y-3 rounded-lg border border-[var(--border)] p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.allergies.allergen}>
                  <Input
                    value={allergy.allergen}
                    onChange={(event) =>
                      updateAllergy(index, { allergen: event.target.value })
                    }
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
                  placeholder="Anaphylaxis"
                />
              </Field>

              <Field label={t.allergies.requiredAction}>
                <Textarea
                  value={allergy.requiredAction}
                  onChange={(event) =>
                    updateAllergy(index, { requiredAction: event.target.value })
                  }
                  placeholder="Administer EpiPen from the red pouch, call 999, then call the parent"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.allergies.medication} hint={t.common.optional}>
                  <Input
                    value={allergy.medication ?? ""}
                    onChange={(event) =>
                      updateAllergy(index, { medication: event.target.value })
                    }
                    placeholder="EpiPen Jr 0.15mg"
                  />
                </Field>
                <Field label={t.allergies.medicationLocation} hint={t.common.optional}>
                  <Input
                    value={allergy.medicationLocation ?? ""}
                    onChange={(event) =>
                      updateAllergy(index, { medicationLocation: event.target.value })
                    }
                    placeholder="Red pouch in the child's bag"
                  />
                </Field>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAllergies((current) => current.filter((_, i) => i !== index))
                }
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.reports.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label={t.reports.notes} hint={t.common.optional} htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

import { redirect } from "next/navigation";
import { CalendarRange, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { listAcademicYears } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { createAcademicYear, setActiveAcademicYear, updateTenantSettings } from "./actions";

export const metadata = { title: "Settings" };

const TIMEZONES = [
  "Africa/Mogadishu",
  "Africa/Nairobi",
  "Africa/Addis_Ababa",
  "Africa/Djibouti",
  "Europe/London",
  "Europe/Stockholm",
  "America/New_York",
  "UTC",
];

const CURRENCIES = ["USD", "SOS", "KES", "ETB", "EUR", "GBP", "SEK"];

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  if (!can(ctx.role, "tenant.view_settings")) redirect(`/${tenantSlug}`);

  const canEdit = can(ctx.role, "tenant.edit_branding") && ctx.canWrite;
  const years = await listAcademicYears(db);

  async function saveSettings(formData: FormData) {
    "use server";
    await updateTenantSettings(tenantSlug, {
      name: String(formData.get("name") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      accentColor: String(formData.get("accentColor") ?? ""),
      address: String(formData.get("address") ?? ""),
      city: String(formData.get("city") ?? ""),
      country: String(formData.get("country") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      website: String(formData.get("website") ?? ""),
      timezone: String(formData.get("timezone") ?? "Africa/Mogadishu"),
      locale: (formData.get("locale") as "en" | "so") ?? "en",
      currency: String(formData.get("currency") ?? "USD"),
    });
  }

  async function addYear(formData: FormData) {
    "use server";
    await createAcademicYear(tenantSlug, {
      name: String(formData.get("yearName") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      makeActive: formData.get("makeActive") !== null,
    });
  }

  async function activateYear(formData: FormData) {
    "use server";
    await setActiveAcademicYear(tenantSlug, String(formData.get("yearId") ?? ""));
  }

  return (
    <>
      <PageHeader title={t.settings.title} />

      {!ctx.canWrite ? (
        <Alert tone="warning" title={t.subscription.readOnlyTitle}>
          {t.subscription.readOnlyBody}
        </Alert>
      ) : null}

      {/* Academic year first: nothing else works without one. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="size-4" aria-hidden />
            {t.settings.academicYears}
          </CardTitle>
          <CardDescription>{t.dashboard.noActiveYearBody}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {years.length > 0 ? (
            <ul className="space-y-2">
              {years.map((year) => (
                <li
                  key={year.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3"
                >
                  <div>
                    <p className="font-medium">{year.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(year.start_date, ctx.tenant.locale)} —{" "}
                      {formatDate(year.end_date, ctx.tenant.locale)}
                    </p>
                  </div>
                  {year.is_active ? (
                    <Badge variant="success">{t.settings.activeYear}</Badge>
                  ) : canEdit ? (
                    <form action={activateYear}>
                      <input type="hidden" name="yearId" value={year.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {t.settings.setActive}
                      </Button>
                    </form>
                  ) : (
                    <Badge variant="muted">{t.settings.closedYear}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {canEdit ? (
            <form action={addYear} className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t.settings.yearName} htmlFor="yearName">
                  <Input id="yearName" name="yearName" placeholder="2025–2026" required />
                </Field>
                <Field label={t.settings.startDate} htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" required />
                </Field>
                <Field label={t.settings.endDate} htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" required />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="makeActive" defaultChecked className="size-4" />
                {t.settings.setActive}
              </label>
              <Button type="submit">{t.settings.addAcademicYear}</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.branding}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveSettings} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.settings.schoolName} htmlFor="name">
                <Input id="name" name="name" defaultValue={ctx.tenant.name} required disabled={!canEdit} />
              </Field>

              <Field label={t.settings.slug} hint={t.settings.slugHelp} htmlFor="slug">
                <Input id="slug" value={ctx.tenant.slug} readOnly disabled className="bg-[var(--muted)]" />
              </Field>

              <Field label={t.settings.tagline} hint={t.common.optional} htmlFor="tagline">
                <Input
                  id="tagline"
                  name="tagline"
                  defaultValue={ctx.tenant.tagline ?? ""}
                  disabled={!canEdit}
                />
              </Field>

              <Field label={t.settings.accentColor} hint={t.common.optional} htmlFor="accentColor">
                <Input
                  id="accentColor"
                  name="accentColor"
                  type="color"
                  defaultValue={ctx.tenant.accent_color ?? "#2a9d9c"}
                  disabled={!canEdit}
                  className="h-11 w-24 p-1"
                />
              </Field>
            </div>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">{t.settings.contact}</legend>
              <Field label={t.settings.address} htmlFor="address">
                <Input id="address" name="address" defaultValue={ctx.tenant.address ?? ""} disabled={!canEdit} />
              </Field>
              <Field label={t.settings.city} htmlFor="city">
                <Input id="city" name="city" defaultValue={ctx.tenant.city ?? ""} disabled={!canEdit} />
              </Field>
              <Field label={t.settings.country} htmlFor="country">
                <Input id="country" name="country" defaultValue={ctx.tenant.country ?? ""} disabled={!canEdit} />
              </Field>
              <Field label={t.settings.phone} htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={ctx.tenant.phone ?? ""} disabled={!canEdit} />
              </Field>
              <Field label={t.settings.contactEmail} htmlFor="contactEmail">
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={ctx.tenant.contact_email ?? ""}
                  disabled={!canEdit}
                />
              </Field>
              <Field label={t.settings.website} htmlFor="website">
                <Input id="website" name="website" type="url" defaultValue={ctx.tenant.website ?? ""} disabled={!canEdit} />
              </Field>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold">{t.settings.operational}</legend>
              <Field label={t.settings.timezone} htmlFor="timezone">
                <Select id="timezone" name="timezone" defaultValue={ctx.tenant.timezone} disabled={!canEdit}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.settings.defaultLanguage} htmlFor="locale">
                <Select id="locale" name="locale" defaultValue={ctx.tenant.locale} disabled={!canEdit}>
                  <option value="en">English</option>
                  <option value="so">Soomaali</option>
                </Select>
              </Field>
              <Field label={t.settings.currency} htmlFor="currency">
                <Select id="currency" name="currency" defaultValue={ctx.tenant.currency} disabled={!canEdit}>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </Select>
              </Field>
            </fieldset>

            {canEdit ? <Button type="submit">{t.common.save}</Button> : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            {t.settings.subscription}
          </CardTitle>
          <CardDescription>{t.settings.subscriptionHelp}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge
            variant={
              ctx.tenant.subscription_status === "active"
                ? "success"
                : ctx.tenant.subscription_status === "trialing"
                  ? "secondary"
                  : "warning"
            }
          >
            {t.subscription.status[ctx.tenant.subscription_status]}
          </Badge>
          <span className="text-sm text-[var(--muted-foreground)]">{ctx.tenant.plan}</span>
        </CardContent>
      </Card>
    </>
  );
}

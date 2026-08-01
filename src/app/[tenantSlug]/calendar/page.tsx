import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { scoped } from "@/lib/db/scope";
import { getTranslations } from "@/lib/i18n";
import { formatDate, formatTime } from "@/lib/utils";
import { createEvent } from "./actions";
import type { CalendarEventRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
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
        <PageHeader title={t.calendar.title} />
        <Alert tone="warning" title={t.dashboard.noActiveYear}>
          {t.dashboard.noActiveYearBody}
        </Alert>
      </>
    );
  }

  const canManage = can(ctx.role, "calendar.manage") && ctx.canWrite;

  const { data } = await db
    .selectForYear("calendar_events", ctx.activeYear.id)
    .order("starts_at");

  const events = (data ?? []) as CalendarEventRow[];
  const now = Date.now();
  const upcoming = events.filter((event) => new Date(event.starts_at).getTime() >= now);
  const past = events.filter((event) => new Date(event.starts_at).getTime() < now).reverse();

  // A plain server action: no client JS needed for a form this simple.
  async function submit(formData: FormData) {
    "use server";
    await createEvent(tenantSlug, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      eventType: (formData.get("eventType") as "activity") ?? "activity",
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
      allDay: formData.get("allDay") !== null,
      location: String(formData.get("location") ?? ""),
      classId: "",
      visibleToParents: formData.get("visibleToParents") !== null,
    });
  }

  return (
    <>
      <PageHeader title={t.calendar.title} description={ctx.activeYear.name} />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.calendar.addEvent}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.calendar.eventTitle} htmlFor="event-title">
                  <Input id="event-title" name="title" required />
                </Field>
                <Field label={t.health.incidentType} htmlFor="event-type">
                  <Select id="event-type" name="eventType" defaultValue="activity">
                    <option value="activity">{t.calendar.types.activity}</option>
                    <option value="holiday">{t.calendar.types.holiday}</option>
                    <option value="meeting">{t.calendar.types.meeting}</option>
                    <option value="closure">{t.calendar.types.closure}</option>
                    <option value="other">{t.calendar.types.other}</option>
                  </Select>
                </Field>
                <Field label={t.calendar.starts} htmlFor="event-start">
                  <Input id="event-start" name="startsAt" type="datetime-local" required />
                </Field>
                <Field label={t.calendar.ends} hint={t.common.optional} htmlFor="event-end">
                  <Input id="event-end" name="endsAt" type="datetime-local" />
                </Field>
                <Field label={t.calendar.location} hint={t.common.optional} htmlFor="event-location">
                  <Input id="event-location" name="location" />
                </Field>
              </div>

              <Field label={t.finance.description} hint={t.common.optional} htmlFor="event-desc">
                <Textarea id="event-desc" name="description" rows={2} />
              </Field>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="allDay" className="size-4" />
                  {t.calendar.allDay}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="visibleToParents" defaultChecked className="size-4" />
                  {t.calendar.visibleToParents}
                </label>
              </div>

              <Button type="submit">{t.calendar.addEvent}</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t.calendar.noEvents}
          description={t.calendar.noEventsBody}
        />
      ) : (
        <div className="space-y-6">
          <EventList
            title={t.dashboard.upcomingEvents}
            events={upcoming}
            locale={ctx.tenant.locale}
            timezone={ctx.tenant.timezone}
            typeLabels={t.calendar.types}
          />
          {past.length > 0 ? (
            <EventList
              title={t.settings.closedYear}
              events={past.slice(0, 10)}
              locale={ctx.tenant.locale}
              timezone={ctx.tenant.timezone}
              typeLabels={t.calendar.types}
              muted
            />
          ) : null}
        </div>
      )}
    </>
  );
}

function EventList({
  title,
  events,
  locale,
  timezone,
  typeLabels,
  muted = false,
}: {
  title: string;
  events: CalendarEventRow[];
  locale: string;
  timezone: string;
  typeLabels: Record<string, string>;
  muted?: boolean;
}) {
  if (events.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {title}
      </h2>
      <ul className={muted ? "space-y-2 opacity-70" : "space-y-2"}>
        {events.map((event) => (
          <li
            key={event.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {formatDate(event.starts_at, locale, timezone)}
                {!event.all_day ? ` · ${formatTime(event.starts_at, timezone)}` : ""}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            <Badge variant="secondary">{typeLabels[event.event_type]}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

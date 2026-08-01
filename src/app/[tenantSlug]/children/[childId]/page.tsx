import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Stethoscope, UserRound } from "lucide-react";

import { AllergyBanner } from "@/components/safety/allergy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantContext } from "@/lib/auth/session";
import { scoped } from "@/lib/db/scope";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatAge, formatDate, initials } from "@/lib/utils";
import type {
  ChildAllergyRow,
  ChildMedicalNoteRow,
  ChildRow,
  EmergencyContactRow,
  AuthorisedPickupRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "Child" };

/**
 * Child detail.
 *
 * Order on the page is a safety decision, not an aesthetic one: the allergy
 * banner renders ABOVE the name and photo, so a teacher who opens this from
 * the roster sees the warning before anything else — one tap from the roster,
 * no scrolling, no second click.
 */
export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; childId: string }>;
}) {
  const { tenantSlug, childId } = await params;

  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  // RLS returns nothing if this child is outside the caller's reach, so a
  // parent guessing another family's id gets a 404, not a record.
  const { data: childData, error } = await db.selectById("children", childId);
  if (error) throw error;
  if (!childData) notFound();

  const child = childData as ChildRow;

  const [allergiesResult, medicalResult, contactsResult, pickupsResult] = await Promise.all([
    db.select("child_allergies").eq("child_id", childId).order("severity"),
    db.select("child_medical_notes").eq("child_id", childId),
    db.select("emergency_contacts").eq("child_id", childId).order("priority"),
    db.select("authorised_pickups").eq("child_id", childId).eq("is_active", true),
  ]);

  const allergies = (allergiesResult.data ?? []) as ChildAllergyRow[];
  const medicalNotes = (medicalResult.data ?? []) as ChildMedicalNoteRow[];
  const contacts = (contactsResult.data ?? []) as EmergencyContactRow[];
  const pickups = (pickupsResult.data ?? []) as AuthorisedPickupRow[];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/${tenantSlug}/children`}>
          <ArrowLeft aria-hidden />
          {t.common.back}
        </Link>
      </Button>

      {/* Above everything. This is the point. */}
      <AllergyBanner allergies={allergies} t={t} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5 sm:pt-6">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-lg font-semibold text-[var(--muted-foreground)]">
            {initials(childDisplayName(child))}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{childDisplayName(child)}</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {formatAge(child.date_of_birth)} ·{" "}
              {formatDate(child.date_of_birth, ctx.tenant.locale)}
              {child.gender ? ` · ${t.children.genders[child.gender]}` : ""}
            </p>
          </div>

          <Badge variant={child.status === "active" ? "success" : "muted"}>
            {t.children.statuses[child.status]}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="size-4" aria-hidden />
              {t.children.emergencyContacts}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">{t.common.none}</p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{contact.name}</p>
                      {contact.relationship ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {contact.relationship}
                        </p>
                      ) : null}
                    </div>
                    {/* A tap-to-call link matters when a child is hurt. */}
                    <a
                      href={`tel:${contact.phone}`}
                      className="shrink-0 text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                    >
                      {contact.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4" aria-hidden />
              {t.children.allowedPickup}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pickups.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">{t.common.none}</p>
            ) : (
              <ul className="space-y-2">
                {pickups.map((pickup) => (
                  <li
                    key={pickup.id}
                    className="rounded-lg border border-[var(--border)] p-3 text-sm"
                  >
                    <p className="font-medium">{pickup.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {[pickup.relationship, pickup.phone].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {child.pickup_notes ? (
              <div className="rounded-lg bg-[var(--muted)] p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {t.children.pickupNotes}
                </p>
                <p className="mt-1">{child.pickup_notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {medicalNotes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="size-4" aria-hidden />
              {t.allergies.medicalNotes}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {medicalNotes.map((note) => (
                <li key={note.id} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="font-medium">{note.title}</p>
                  {note.details ? <p className="mt-1 text-sm">{note.details}</p> : null}
                  {note.action_plan ? (
                    <p className="mt-2 rounded-md bg-[var(--muted)] p-2 text-sm">
                      <span className="font-medium">{t.allergies.actionPlan}: </span>
                      {note.action_plan}
                    </p>
                  ) : null}
                  {note.doctor_name ? (
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      {t.allergies.doctor}: {note.doctor_name}
                      {note.doctor_phone ? ` · ${note.doctor_phone}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {child.notes && ctx.role !== "parent" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.children.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{child.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

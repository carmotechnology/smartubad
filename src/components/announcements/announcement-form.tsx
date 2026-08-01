"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { postAnnouncement } from "@/app/[tenantSlug]/announcements/actions";
import type { UserRole } from "@/lib/supabase/database.types";

export function AnnouncementForm({
  tenantSlug,
  role,
  classes,
}: {
  tenantSlug: string;
  role: UserRole;
  classes: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  // Teachers can only address their own class, so the audience is fixed.
  const [audience, setAudience] = React.useState<"school" | "class" | "staff">(
    role === "teacher" ? "class" : "school",
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await postAnnouncement(tenantSlug, {
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      audience,
      classId: String(form.get("classId") ?? ""),
      isPinned: form.get("isPinned") === "on",
    });

    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(t.common.saved);
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.announcements.newAnnouncement}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t.announcements.subject} htmlFor="announcement-title">
            <Input id="announcement-title" name="title" required maxLength={160} />
          </Field>

          <Field label={t.announcements.body} htmlFor="announcement-body">
            <Textarea id="announcement-body" name="body" required rows={4} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.announcements.audience} htmlFor="announcement-audience">
              <Select
                id="announcement-audience"
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as "school" | "class" | "staff")
                }
                disabled={role === "teacher"}
              >
                {role !== "teacher" ? (
                  <>
                    <option value="school">{t.announcements.audiences.school}</option>
                    <option value="staff">{t.announcements.audiences.staff}</option>
                  </>
                ) : null}
                <option value="class">{t.announcements.audiences.class}</option>
              </Select>
            </Field>

            {audience === "class" ? (
              <Field label={t.classes.title} htmlFor="announcement-class">
                <Select id="announcement-class" name="classId" required>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPinned" className="size-4" />
            {t.announcements.pin}
          </label>

          <Button type="submit" disabled={pending}>
            <Send aria-hidden />
            {pending ? t.common.saving : t.announcements.newAnnouncement}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

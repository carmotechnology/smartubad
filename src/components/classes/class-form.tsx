"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { createClass } from "@/app/[tenantSlug]/classes/actions";

export function ClassForm({
  tenantSlug,
  teachers,
}: {
  tenantSlug: string;
  teachers: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await createClass(tenantSlug, {
      name: String(form.get("name") ?? ""),
      room: String(form.get("room") ?? ""),
      capacity: Number(form.get("capacity") ?? 20),
      ageRange: String(form.get("ageRange") ?? ""),
      colour: "",
      teacherIds: selected,
    });

    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(t.common.saved);
    (event.target as HTMLFormElement).reset();
    setSelected([]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.classes.addClass}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.classes.className} htmlFor="class-name">
              <Input id="class-name" name="name" required placeholder="Toddlers A" />
            </Field>
            <Field label={t.classes.room} hint={t.common.optional} htmlFor="class-room">
              <Input id="class-room" name="room" />
            </Field>
            <Field label={t.classes.capacity} htmlFor="class-capacity">
              <Input
                id="class-capacity"
                name="capacity"
                type="number"
                min={1}
                max={200}
                defaultValue={20}
                required
              />
            </Field>
            <Field label={t.classes.ageRange} hint={t.common.optional} htmlFor="class-age">
              <Input id="class-age" name="ageRange" placeholder="2–3" />
            </Field>
          </div>

          {teachers.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.classes.teachers}</legend>
              <div className="flex flex-wrap gap-2">
                {teachers.map((teacher) => {
                  const checked = selected.includes(teacher.id);
                  return (
                    <label
                      key={teacher.id}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                        checked
                          ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setSelected((current) =>
                            checked
                              ? current.filter((id) => id !== teacher.id)
                              : [...current, teacher.id],
                          )
                        }
                      />
                      {teacher.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <Button type="submit" disabled={pending}>
            <Plus aria-hidden />
            {pending ? t.common.saving : t.classes.addClass}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

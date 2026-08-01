"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/components/i18n-provider";
import { inviteParent, inviteStaff } from "@/app/[tenantSlug]/staff/actions";

type Option = { id: string; name: string };

/**
 * Invite forms. The URL is shown back after sending so an admin can pass it
 * on by WhatsApp when email is unreliable — the link is still email-bound and
 * single-use, so sharing it is not a way around the identity check.
 */
export function InviteStaffForm({
  tenantSlug,
  classes,
}: {
  tenantSlug: string;
  classes: Option[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = React.useState<string[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setInviteUrl(null);

    const form = new FormData(event.currentTarget);
    const result = await inviteStaff(tenantSlug, {
      email: String(form.get("email") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      role: (form.get("role") as "admin" | "teacher") ?? "teacher",
      classIds: selectedClasses,
      message: String(form.get("message") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setInviteUrl(result.data?.inviteUrl ?? null);
    toast.success(t.staff.invited);
    (event.target as HTMLFormElement).reset();
    setSelectedClasses([]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.staff.inviteStaff}</CardTitle>
        <CardDescription>{t.platform.ownerEmailHelp}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.staff.email} htmlFor="staff-email">
              <Input id="staff-email" name="email" type="email" required />
            </Field>
            <Field label={t.staff.name} hint={t.common.optional} htmlFor="staff-name">
              <Input id="staff-name" name="fullName" />
            </Field>
            <Field label={t.staff.role} htmlFor="staff-role">
              <Select id="staff-role" name="role" defaultValue="teacher">
                <option value="teacher">{t.staff.roles.teacher}</option>
                <option value="admin">{t.staff.roles.admin}</option>
              </Select>
            </Field>
          </div>

          {classes.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.staff.assignedClasses}</legend>
              <div className="flex flex-wrap gap-2">
                {classes.map((klass) => {
                  const checked = selectedClasses.includes(klass.id);
                  return (
                    <label
                      key={klass.id}
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
                          setSelectedClasses((current) =>
                            checked
                              ? current.filter((id) => id !== klass.id)
                              : [...current, klass.id],
                          )
                        }
                      />
                      {klass.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <Field label={t.announcements.body} hint={t.common.optional} htmlFor="staff-message">
            <Textarea id="staff-message" name="message" rows={2} />
          </Field>

          <Button type="submit" disabled={pending}>
            <Send aria-hidden />
            {pending ? t.common.saving : t.staff.inviteStaff}
          </Button>

          {inviteUrl ? <InviteLink url={inviteUrl} /> : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function InviteParentForm({
  tenantSlug,
  childrenOptions,
}: {
  tenantSlug: string;
  childrenOptions: Option[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [selectedChildren, setSelectedChildren] = React.useState<string[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedChildren.length === 0) {
      toast.error(t.children.noChildren);
      return;
    }

    setPending(true);
    setInviteUrl(null);

    const form = new FormData(event.currentTarget);
    const result = await inviteParent(tenantSlug, {
      email: String(form.get("email") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      childIds: selectedChildren,
      message: String(form.get("message") ?? ""),
    });

    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setInviteUrl(result.data?.inviteUrl ?? null);
    toast.success(t.staff.invited);
    (event.target as HTMLFormElement).reset();
    setSelectedChildren([]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.children.parents}</CardTitle>
        <CardDescription>{t.platform.ownerEmailHelp}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.staff.email} htmlFor="parent-email">
              <Input id="parent-email" name="email" type="email" required />
            </Field>
            <Field label={t.staff.name} hint={t.common.optional} htmlFor="parent-name">
              <Input id="parent-name" name="fullName" />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.children.title}</legend>
            {childrenOptions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">{t.children.noChildren}</p>
            ) : (
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {childrenOptions.map((child) => {
                  const checked = selectedChildren.includes(child.id);
                  return (
                    <label
                      key={child.id}
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
                          setSelectedChildren((current) =>
                            checked
                              ? current.filter((id) => id !== child.id)
                              : [...current, child.id],
                          )
                        }
                      />
                      {child.name}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <Field label={t.announcements.body} hint={t.common.optional} htmlFor="parent-message">
            <Textarea id="parent-message" name="message" rows={2} />
          </Field>

          <Button type="submit" disabled={pending}>
            <Send aria-hidden />
            {pending ? t.common.saving : t.common.add}
          </Button>

          {inviteUrl ? <InviteLink url={inviteUrl} /> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function InviteLink({ url }: { url: string }) {
  const { t } = useI18n();

  return (
    <Alert tone="success" title={t.staff.invited}>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1 text-xs">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast.success(t.common.saved);
          }}
        >
          <Copy aria-hidden />
        </Button>
      </div>
    </Alert>
  );
}

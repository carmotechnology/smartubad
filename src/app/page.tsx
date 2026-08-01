import { redirect } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { getTranslations } from "@/lib/i18n";
import type { TenantRow } from "@/lib/supabase/database.types";

/**
 * Root route. Signed-in users are sent to where they belong; everyone else
 * sees a short sign-in prompt. There is no public marketing site in v1.
 */
export default async function HomePage() {
  const profile = await getProfile();
  const { t } = await getTranslations();

  if (profile) {
    if (profile.role === "super_admin") redirect("/platform");

    if (profile.tenant_id) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", profile.tenant_id)
        .maybeSingle();

      const tenant = data as Pick<TenantRow, "slug"> | null;
      if (tenant) redirect(`/${tenant.slug}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-2xl text-[var(--primary-foreground)]">
          🧸
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{publicEnv.appName}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          A calm, secure way to run a kindergarten — children, attendance, daily reports and
          families, all in one place.
        </p>
      </div>

      <div className="w-full space-y-3">
        <Button asChild size="touch">
          <Link href="/login">{t.common.signIn}</Link>
        </Button>
        <p className="text-xs text-[var(--muted-foreground)]">{t.auth.noAccount}</p>
      </div>
    </main>
  );
}

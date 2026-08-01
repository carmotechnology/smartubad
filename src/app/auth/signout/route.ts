import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

/**
 * POST-only: a GET sign-out can be triggered by any image tag or prefetch,
 * which is a small but real CSRF nuisance.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("tenant_id, email")
      .eq("id", user.id)
      .maybeSingle();

    const profile = data as { tenant_id: string | null; email: string } | null;

    await recordAudit({
      tenantId: profile?.tenant_id ?? null,
      actorId: user.id,
      actorEmail: profile?.email ?? user.email ?? null,
      action: "auth.logout",
    });
  }

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

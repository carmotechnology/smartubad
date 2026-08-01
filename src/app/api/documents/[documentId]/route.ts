import { NextResponse, type NextRequest } from "next/server";

import { requireProfile } from "@/lib/auth/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthError } from "@/lib/auth/errors";
import type { ChildDocumentRow } from "@/lib/supabase/database.types";

/**
 * Gated document download.
 *
 * The `child-documents` bucket is private and its storage policy is staff-only,
 * so guardians cannot read objects directly. This route re-checks the row with
 * the *user's* client — meaning RLS decides whether they may see the document
 * at all, including the `parent_visible` rule — and only then mints a signed
 * URL valid for sixty seconds.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  try {
    await requireProfile();
  } catch (error) {
    const status = isAuthError(error) ? error.status : 500;
    return NextResponse.json({ error: "Not permitted" }, { status });
  }

  const supabase = await createClient();

  // RLS applies here. A parent gets a row only for their own child, and only
  // when it is marked parent_visible.
  const { data, error } = await supabase
    .from("child_documents")
    .select("id, storage_path, title")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const document = data as Pick<ChildDocumentRow, "id" | "storage_path" | "title">;

  // Signing needs to bypass the staff-only storage policy, which is safe:
  // the authorisation decision was made above, by RLS, on the user's client.
  const admin = createServiceRoleClient();
  const { data: signed, error: signError } = await admin.storage
    .from("child-documents")
    .createSignedUrl(document.storage_path, 60);

  if (signError || !signed) {
    console.error("[documents] failed to sign url", signError);
    return NextResponse.json({ error: "Could not open that document" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

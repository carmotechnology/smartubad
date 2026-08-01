import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireTenantContext } from "@/lib/auth/session";
import { scoped } from "@/lib/db/scope";
import { listChildrenWithSafety } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n";
import { childDisplayName, formatDate } from "@/lib/utils";
import type { ChildDocumentRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Documents" };

/**
 * Per-child records held in Supabase Storage.
 *
 * Files live in a private bucket; nothing here links straight to storage.
 * Downloads go through `/api/documents/[id]`, which re-checks permission and
 * mints a short-lived signed URL — a leaked list page therefore leaks nothing.
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);
  const db = scoped(ctx);

  const [{ data }, children] = await Promise.all([
    db.select("child_documents").order("created_at", { ascending: false }),
    listChildrenWithSafety(db),
  ]);

  const documents = (data ?? []) as ChildDocumentRow[];
  const childNames = new Map(children.map((child) => [child.id, childDisplayName(child)]));

  return (
    <>
      <PageHeader title={t.documents.title} />

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={t.documents.noDocuments}
          description={t.documents.noDocumentsBody}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.documents.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                >
                  <div className="min-w-0">
                    <a
                      href={`/api/documents/${document.id}`}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {document.title}
                    </a>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {childNames.get(document.child_id) ?? ""} ·{" "}
                      {formatDate(document.created_at, ctx.tenant.locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {t.documents.categories[document.category]}
                    </Badge>
                    {document.parent_visible ? (
                      <Badge variant="muted">{t.documents.visibleToParent}</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

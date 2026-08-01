import { redirect } from "next/navigation";
import { BookHeart, Baby, Puzzle, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { requireTenantContext } from "@/lib/auth/session";
import { getTranslations } from "@/lib/i18n";

export const metadata = { title: "Parent Corner" };

/**
 * Parent Corner — the place, not the content.
 *
 * v1 ships the navigation and the shell so the section exists and is
 * reachable. The parenting-education material (child development, at-home
 * activities, in English and Somali, eventually audio and short video) is
 * written later and published into these categories.
 *
 * The tone is deliberate: supportive, never judgemental. A parent opening
 * this should feel offered something, not tested.
 */
export default async function ParentCornerPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const { t } = await getTranslations(ctx.tenant.locale);

  if (ctx.role !== "parent") redirect(`/${tenantSlug}`);

  const categories = [
    { icon: Baby, title: "Growing & developing", key: "development" },
    { icon: Puzzle, title: "Play at home", key: "activities" },
    { icon: Sparkles, title: "Everyday routines", key: "routines" },
  ];

  return (
    <>
      <PageHeader title={t.parentCorner.title} description={t.parentCorner.subtitle} />

      <Alert tone="info" icon={<BookHeart />} title={t.parentCorner.comingSoonTitle}>
        <p>{t.parentCorner.comingSoonBody}</p>
        <p className="mt-2 italic">{t.parentCorner.comingSoonNote}</p>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Card key={category.key} className="opacity-70">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)]">
                  <Icon className="size-5" aria-hidden />
                </div>
                <CardTitle className="mt-2">{category.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="muted">{t.parentCorner.comingSoonTitle}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

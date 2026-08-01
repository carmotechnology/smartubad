"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { navItemsForRole, primaryNavForRole } from "./nav-config";
import { cn, initials } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/config";
import type { SubscriptionStatus, UserRole } from "@/lib/supabase/database.types";

export type ShellUser = {
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
};

export type ShellTenant = {
  name: string;
  slug: string;
  logoUrl: string | null;
  subscriptionStatus: SubscriptionStatus;
};

export function AppShell({
  tenant,
  user,
  locale,
  banner,
  children,
}: {
  tenant: ShellTenant;
  user: ShellUser;
  locale: Locale;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar tenant={tenant} user={user} locale={locale} />

      {mobileOpen ? (
        <MobileDrawer
          tenant={tenant}
          user={user}
          locale={locale}
          onClose={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar tenant={tenant} onOpen={() => setMobileOpen(true)} />
        {banner}
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
        <MobileBottomBar tenant={tenant} role={user.role} />
      </div>
    </div>
  );
}

function NavLinks({ tenant, role }: { tenant: ShellTenant; role: UserRole }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/${tenant.slug}`;
  const items = navItemsForRole(role);

  return (
    <nav className="space-y-0.5" aria-label="Main">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active =
          item.href === "" ? pathname === base : pathname.startsWith(href);
        const Icon = item.icon;

        return (
          <Link
            key={item.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span className="truncate">{item.label(t)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SchoolMark({ tenant }: { tenant: ShellTenant }) {
  return (
    <Link href={`/${tenant.slug}`} className="flex items-center gap-2.5 min-w-0">
      {tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logoUrl}
          alt=""
          className="size-9 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
          🧸
        </span>
      )}
      <span className="min-w-0 truncate font-semibold">{tenant.name}</span>
    </Link>
  );
}

function UserFooter({
  user,
  locale,
}: {
  user: ShellUser;
  locale: Locale;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 border-t border-[var(--border)] p-3">
      <div className="flex items-center gap-2.5">
        <Avatar className="size-9">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {t.staff.roles[user.role]}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <LanguageSwitcher current={locale} compact />
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
            <LogOut className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{t.common.signOut}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function DesktopSidebar({
  tenant,
  user,
  locale,
}: {
  tenant: ShellTenant;
  user: ShellUser;
  locale: Locale;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] lg:flex">
      <div className="p-4">
        <SchoolMark tenant={tenant} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavLinks tenant={tenant} role={user.role} />
      </div>
      <UserFooter user={user} locale={locale} />
    </aside>
  );
}

function MobileTopBar({
  tenant,
  onOpen,
}: {
  tenant: ShellTenant;
  onOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        aria-label="Open navigation"
        className="-ml-2"
      >
        <Menu className="size-5" aria-hidden />
      </Button>
      <SchoolMark tenant={tenant} />
    </header>
  );
}

function MobileDrawer({
  tenant,
  user,
  locale,
  onClose,
}: {
  tenant: ShellTenant;
  user: ShellUser;
  locale: Locale;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close navigation"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-[var(--card)] shadow-xl"
      >
        <div className="flex items-center justify-between p-4">
          <SchoolMark tenant={tenant} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks tenant={tenant} role={user.role} />
        </div>
        <UserFooter user={user} locale={locale} />
      </div>
    </div>
  );
}

/**
 * Phone bottom bar. Teachers take attendance one-handed while holding a
 * clipboard or a child, so the few things they do every day are always a
 * thumb-reach away rather than behind a menu.
 */
function MobileBottomBar({ tenant, role }: { tenant: ShellTenant; role: UserRole }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const items = primaryNavForRole(role);
  const base = `/${tenant.slug}`;

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--border)] bg-[var(--card)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base : pathname.startsWith(href);
        const Icon = item.icon;

        return (
          <Link
            key={item.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium",
              active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="max-w-full truncate">{item.label(t)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SubscriptionBanner({
  status,
  title,
  body,
  contact,
}: {
  status: SubscriptionStatus;
  title: string;
  body: string;
  contact: string;
}) {
  if (status === "active" || status === "trialing") return null;

  return (
    <div
      role="status"
      className="border-b border-[color-mix(in_oklch,var(--warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--warning)_20%,var(--card))] px-4 py-3 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge variant="warning">{title}</Badge>
        <span className="text-[var(--muted-foreground)]">{body}</span>
        <span className="font-medium">{contact}</span>
      </div>
    </div>
  );
}

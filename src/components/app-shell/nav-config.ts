import type { LucideIcon } from "lucide-react";
import {
  BookHeart,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  Megaphone,
  Settings,
  UserRoundPlus,
  Users,
  Wallet,
} from "lucide-react";

import { can, type Permission } from "@/lib/auth/rbac";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { UserRole } from "@/lib/supabase/database.types";

export type NavItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  label: (t: Dictionary) => string;
  /** Shown when the role holds ANY of these. */
  permissions: Permission[];
  /** Promoted into the mobile bottom bar for these roles. */
  primaryFor?: UserRole[];
};

const ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "",
    icon: Home,
    label: (t) => t.nav.dashboard,
    permissions: [],
    primaryFor: ["owner", "admin", "teacher", "parent"],
  },
  {
    key: "attendance",
    href: "/attendance",
    icon: ClipboardList,
    label: (t) => t.nav.attendance,
    permissions: ["attendance.view"],
    primaryFor: ["teacher", "owner", "admin"],
  },
  {
    key: "children",
    href: "/children",
    icon: Users,
    label: (t) => t.nav.children,
    permissions: ["children.view_all", "children.view_assigned", "children.view_own"],
    primaryFor: ["owner", "admin", "teacher", "parent"],
  },
  {
    key: "reports",
    href: "/reports",
    icon: FileText,
    label: (t) => t.nav.reports,
    permissions: ["reports.view"],
    primaryFor: ["teacher", "parent"],
  },
  {
    key: "classes",
    href: "/classes",
    icon: GraduationCap,
    label: (t) => t.nav.classes,
    permissions: ["classes.view"],
  },
  {
    key: "staff",
    href: "/staff",
    icon: UserRoundPlus,
    label: (t) => t.nav.staff,
    permissions: ["staff.view"],
  },
  {
    key: "announcements",
    href: "/announcements",
    icon: Megaphone,
    label: (t) => t.nav.announcements,
    permissions: ["announcements.view"],
  },
  {
    key: "calendar",
    href: "/calendar",
    icon: CalendarDays,
    label: (t) => t.nav.calendar,
    permissions: ["calendar.view"],
  },
  {
    key: "health",
    href: "/health",
    icon: HeartPulse,
    label: (t) => t.nav.health,
    permissions: ["incidents.view"],
  },
  {
    key: "finance",
    href: "/finance",
    icon: Wallet,
    label: (t) => t.nav.finance,
    permissions: ["finance.view", "finance.view_own_child"],
  },
  {
    key: "documents",
    href: "/documents",
    icon: FileText,
    label: (t) => t.nav.documents,
    permissions: ["documents.view_staff", "documents.view_own_child"],
  },
  {
    key: "admissions",
    href: "/admissions",
    icon: UserRoundPlus,
    label: (t) => t.nav.admissions,
    permissions: ["admissions.view"],
  },
  {
    key: "parent-corner",
    href: "/parent-corner",
    icon: BookHeart,
    label: (t) => t.nav.parentCorner,
    // Parent-only by construction: no other role holds children.view_own.
    permissions: ["children.view_own"],
    primaryFor: ["parent"],
  },
  {
    key: "settings",
    href: "/settings",
    icon: Settings,
    label: (t) => t.nav.settings,
    permissions: ["tenant.view_settings"],
  },
];

/**
 * The sidebar shows only what the role can actually reach. This is a UI
 * affordance, not a security control — every page re-checks server-side.
 */
export function navItemsForRole(role: UserRole): NavItem[] {
  return ITEMS.filter(
    (item) =>
      item.permissions.length === 0 ||
      item.permissions.some((permission) => can(role, permission)),
  );
}

/** Up to five items for the phone bottom bar. */
export function primaryNavForRole(role: UserRole): NavItem[] {
  return navItemsForRole(role)
    .filter((item) => item.primaryFor?.includes(role))
    .slice(0, 5);
}

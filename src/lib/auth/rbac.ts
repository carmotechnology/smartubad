import type { UserRole } from "@/lib/supabase/database.types";

/**
 * The single source of truth for "who may do what".
 *
 * This mirrors the RLS policies in `supabase/migrations/0008-0010`. The
 * database is the enforcement boundary; this table exists so the UI can hide
 * what a user cannot do, and so server actions can fail fast with a clear
 * message instead of a bare Postgres permission error.
 *
 * Adding a permission here does NOT grant it. The matching RLS policy does.
 */

export const PERMISSIONS = [
  // Tenant settings
  "tenant.view_settings",
  "tenant.edit_branding",
  "tenant.edit_subscription", // super-admin only

  // Academic year
  "academic_year.view",
  "academic_year.manage",

  // People
  "children.view_all",
  "children.view_assigned",
  "children.view_own",
  "children.manage",
  "children.edit_pickup_notes",
  "staff.view",
  "staff.manage",
  "classes.view",
  "classes.manage",

  // Daily operations
  "attendance.view",
  "attendance.record",
  "reports.view",
  "reports.write",
  "incidents.view",
  "incidents.write",

  // Communication
  "announcements.view",
  "announcements.post_school",
  "announcements.post_class",
  "calendar.view",
  "calendar.manage",

  // Records & money
  "documents.view_staff",
  "documents.view_own_child",
  "documents.manage",
  "finance.view",
  "finance.manage",
  "finance.view_own_child",

  // Admissions
  "admissions.view",
  "admissions.manage",

  // Invitations
  "invites.staff",
  "invites.parents",

  // Platform
  "platform.manage_tenants",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMISSIONS: Permission[] = [
  "tenant.view_settings",
  "tenant.edit_branding",
  "academic_year.view",
  "academic_year.manage",
  "children.view_all",
  "children.manage",
  "children.edit_pickup_notes",
  "staff.view",
  "staff.manage",
  "classes.view",
  "classes.manage",
  "attendance.view",
  "attendance.record",
  "reports.view",
  "reports.write",
  "incidents.view",
  "incidents.write",
  "announcements.view",
  "announcements.post_school",
  "announcements.post_class",
  "calendar.view",
  "calendar.manage",
  "documents.view_staff",
  "documents.manage",
  "finance.view",
  "finance.manage",
  "admissions.view",
  "admissions.manage",
  "invites.staff",
  "invites.parents",
  "audit.view",
];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  // Platform owner. Deliberately NOT given any tenant content permission:
  // they manage tenants and read aggregate stats, they do not browse schools.
  super_admin: ["platform.manage_tenants", "tenant.edit_subscription"],

  owner: OWNER_PERMISSIONS,

  // Same as owner in v1. Kept as a separate list so the two can diverge
  // (e.g. removing finance from admin) without touching anything else.
  admin: OWNER_PERMISSIONS,

  teacher: [
    "academic_year.view",
    "children.view_assigned",
    "classes.view",
    "attendance.view",
    "attendance.record",
    "reports.view",
    "reports.write",
    "incidents.view",
    "incidents.write",
    "announcements.view",
    "announcements.post_class",
    "calendar.view",
    "calendar.manage",
    "documents.view_staff",
    "invites.parents",
  ],

  parent: [
    "academic_year.view",
    "children.view_own",
    "children.edit_pickup_notes",
    "attendance.view",
    "reports.view",
    "incidents.view",
    "announcements.view",
    "calendar.view",
    "documents.view_own_child",
    "finance.view_own_child",
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export const STAFF_ROLES: UserRole[] = ["owner", "admin", "teacher"];
export const ADMIN_ROLES: UserRole[] = ["owner", "admin"];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

import "server-only";

import type { TenantScope } from "./scope";
import type {
  AcademicYearRow,
  AttendanceRecordRow,
  ChildAllergyRow,
  ChildRow,
  ClassRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

/**
 * Shared reads. Everything goes through `TenantScope`, so each query is
 * tenant-filtered in the application layer before RLS filters it again.
 */

export type ChildWithSafety = ChildRow & {
  allergies: ChildAllergyRow[];
};

export type RosterEntry = ChildWithSafety & {
  attendance: AttendanceRecordRow | null;
};

// Severity ranking lives in `lib/safety.ts` so client components can use it
// too; re-exported here for callers already importing from this module.
export { worstSeverity, hasSevereAllergy } from "@/lib/safety";

export async function listAcademicYears(db: TenantScope): Promise<AcademicYearRow[]> {
  const { data, error } = await db
    .select("academic_years")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademicYearRow[];
}

export async function listClasses(
  db: TenantScope,
  academicYearId: string,
): Promise<ClassRow[]> {
  const { data, error } = await db
    .selectForYear("classes", academicYearId)
    .eq("is_archived", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as ClassRow[];
}

/** Classes the signed-in teacher is assigned to; admins get all of them. */
export async function classesForUser(
  db: TenantScope,
  academicYearId: string,
  profileId: string,
  role: string,
): Promise<ClassRow[]> {
  if (role === "owner" || role === "admin") {
    return listClasses(db, academicYearId);
  }

  const { data: links, error: linkError } = await db
    .select("class_teachers", "class_id")
    .eq("profile_id", profileId);
  if (linkError) throw linkError;

  const classIds = (links ?? []).map((row: { class_id: string }) => row.class_id);
  if (classIds.length === 0) return [];

  const { data, error } = await db
    .selectForYear("classes", academicYearId)
    .in("id", classIds)
    .eq("is_archived", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as ClassRow[];
}

/**
 * Children visible to the caller, each with their allergies attached.
 *
 * RLS decides the row set — admins get the school, teachers get their classes,
 * parents get their own children — so this same call is correct for all roles
 * without branching.
 */
export async function listChildrenWithSafety(
  db: TenantScope,
  options: { classId?: string; academicYearId?: string; search?: string } = {},
): Promise<ChildWithSafety[]> {
  let childIds: string[] | null = null;

  if (options.classId && options.academicYearId) {
    const { data, error } = await db
      .selectForYear("enrollments", options.academicYearId, "child_id")
      .eq("class_id", options.classId)
      .eq("status", "active");
    if (error) throw error;
    const ids: string[] = ((data ?? []) as { child_id: string }[]).map(
      (row) => row.child_id,
    );
    if (ids.length === 0) return [];
    childIds = ids;
  }

  const restrictTo = childIds;
  let query = db.select("children").order("first_name");
  if (restrictTo) query = query.in("id", restrictTo);
  if (options.search) {
    const term = `%${options.search.replace(/[%_]/g, "")}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},preferred_name.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const children = (data ?? []) as ChildRow[];
  if (children.length === 0) return [];

  const { data: allergyData, error: allergyError } = await db
    .select("child_allergies")
    .in(
      "child_id",
      children.map((child) => child.id),
    );
  if (allergyError) throw allergyError;

  const allergies = (allergyData ?? []) as ChildAllergyRow[];
  const byChild = new Map<string, ChildAllergyRow[]>();
  for (const allergy of allergies) {
    const list = byChild.get(allergy.child_id) ?? [];
    list.push(allergy);
    byChild.set(allergy.child_id, list);
  }

  return children.map((child) => ({
    ...child,
    allergies: byChild.get(child.id) ?? [],
  }));
}

/** A class roster for one day, with today's attendance already joined on. */
export async function classRoster(
  db: TenantScope,
  classId: string,
  academicYearId: string,
  date: string,
): Promise<RosterEntry[]> {
  const children = await listChildrenWithSafety(db, { classId, academicYearId });
  if (children.length === 0) return [];

  const { data, error } = await db
    .select("attendance_records")
    .eq("class_id", classId)
    .eq("attendance_date", date);
  if (error) throw error;

  const records = (data ?? []) as AttendanceRecordRow[];
  const byChild = new Map(records.map((record) => [record.child_id, record]));

  return children.map((child) => ({
    ...child,
    attendance: byChild.get(child.id) ?? null,
  }));
}

export async function listStaff(db: TenantScope): Promise<ProfileRow[]> {
  const { data, error } = await db
    .select("profiles")
    .in("role", ["owner", "admin", "teacher"])
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

/** Children the signed-in parent is a guardian of. */
export async function childrenForParent(
  db: TenantScope,
  profileId: string,
): Promise<ChildWithSafety[]> {
  const { data, error } = await db
    .select("guardians", "child_id")
    .eq("profile_id", profileId);
  if (error) throw error;

  const childIds = (data ?? []).map((row: { child_id: string }) => row.child_id);
  if (childIds.length === 0) return [];

  const children = await listChildrenWithSafety(db);
  return children.filter((child) => childIds.includes(child.id));
}

export type AttendanceTotals = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
};

export async function attendanceTotals(
  db: TenantScope,
  academicYearId: string,
  date: string,
): Promise<AttendanceTotals> {
  const { data, error } = await db
    .selectForYear("attendance_records", academicYearId, "status")
    .eq("attendance_date", date);
  if (error) throw error;

  const rows = (data ?? []) as Pick<AttendanceRecordRow, "status">[];
  const totals: AttendanceTotals = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    unmarked: 0,
  };

  for (const row of rows) totals[row.status] += 1;

  const enrolled = await db.count("enrollments", (q) =>
    q.eq("academic_year_id", academicYearId).eq("status", "active"),
  );
  totals.unmarked = Math.max(0, enrolled - rows.length);

  return totals;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  clientForUser,
  createTestUser,
  deleteTestUser,
  hasCredentials,
  type AnyClient,
} from "./helpers/supabase";

/**
 * CROSS-TENANT ISOLATION.
 *
 * These tests build two complete schools and then, as a real authenticated
 * user of school A, attempt every kind of reach into school B: reading rows,
 * reading a row by its exact id, inserting into B, updating B's rows, and
 * deleting them. Every one must come back empty or refused.
 *
 * They deliberately use the anon key with a user session, NOT the service-role
 * key — that is the same posture the application runs in, so what passes here
 * is what RLS actually enforces in production.
 *
 * Requires migrations 0001–0011 to have been applied. Skips (does not fail)
 * when no Supabase credentials are configured.
 */

const RUN = hasCredentials;

const SUFFIX = Date.now().toString(36);
const A = {
  slug: `test-alpha-${SUFFIX}`,
  ownerEmail: `rls-alpha-owner-${SUFFIX}@example.com`,
  parentEmail: `rls-alpha-parent-${SUFFIX}@example.com`,
  teacherEmail: `rls-alpha-teacher-${SUFFIX}@example.com`,
};
const B = {
  slug: `test-beta-${SUFFIX}`,
  ownerEmail: `rls-beta-owner-${SUFFIX}@example.com`,
};

type Fixture = {
  tenantId: string;
  yearId: string;
  classId: string;
  childIds: string[];
  ownerId: string;
};

let admin: AnyClient;
let alpha: Fixture;
let beta: Fixture;
let alphaOwner: AnyClient;
let alphaParent: AnyClient;
let alphaTeacher: AnyClient;
let alphaParentId: string;

async function buildTenant(
  slug: string,
  ownerEmail: string,
  status: "active" | "suspended" = "active",
): Promise<Fixture> {
  const ownerId = await createTestUser(ownerEmail, `Owner ${slug}`);

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: `Test ${slug}`, slug, subscription_status: status })
    .select("id")
    .single();
  if (tenantError) throw tenantError;
  const tenantId = (tenant as { id: string }).id;

  await admin.from("profiles").upsert(
    { id: ownerId, tenant_id: tenantId, role: "owner", email: ownerEmail, full_name: `Owner ${slug}` },
    { onConflict: "id" },
  );

  const { data: year, error: yearError } = await admin
    .from("academic_years")
    .insert({
      tenant_id: tenantId,
      name: "2025–2026",
      start_date: "2025-09-01",
      end_date: "2026-07-15",
      is_active: true,
    })
    .select("id")
    .single();
  if (yearError) throw yearError;
  const yearId = (year as { id: string }).id;

  const { data: klass, error: classError } = await admin
    .from("classes")
    .insert({ tenant_id: tenantId, academic_year_id: yearId, name: "Room 1", capacity: 10 })
    .select("id")
    .single();
  if (classError) throw classError;
  const classId = (klass as { id: string }).id;

  const { data: children, error: childError } = await admin
    .from("children")
    .insert([
      { tenant_id: tenantId, first_name: "Child", last_name: `One-${slug}`, date_of_birth: "2022-01-01" },
      { tenant_id: tenantId, first_name: "Child", last_name: `Two-${slug}`, date_of_birth: "2022-02-01" },
    ])
    .select("id");
  if (childError) throw childError;
  const childIds = (children as { id: string }[]).map((child) => child.id);

  await admin.from("enrollments").insert(
    childIds.map((childId) => ({
      tenant_id: tenantId,
      academic_year_id: yearId,
      child_id: childId,
      class_id: classId,
      status: "active",
    })),
  );

  await admin.from("child_allergies").insert({
    tenant_id: tenantId,
    child_id: childIds[0],
    allergen: "Peanuts",
    severity: "severe",
    reaction: "Anaphylaxis",
    required_action: "EpiPen, then call 999",
  });

  await admin.from("attendance_records").insert({
    tenant_id: tenantId,
    academic_year_id: yearId,
    child_id: childIds[0],
    class_id: classId,
    attendance_date: "2025-09-02",
    status: "present",
  });

  await admin.from("fees").insert({
    tenant_id: tenantId,
    academic_year_id: yearId,
    child_id: childIds[0],
    description: "Term 1",
    amount_minor: 10000,
    currency: "USD",
  });

  return { tenantId, yearId, classId, childIds, ownerId };
}

async function teardown() {
  if (!RUN) return;
  const client = adminClient();
  await client.from("tenants").delete().in("slug", [A.slug, B.slug]);
  await Promise.all(
    [A.ownerEmail, A.parentEmail, A.teacherEmail, B.ownerEmail].map(deleteTestUser),
  );
}

beforeAll(async () => {
  if (!RUN) return;
  admin = adminClient();

  alpha = await buildTenant(A.slug, A.ownerEmail);
  beta = await buildTenant(B.slug, B.ownerEmail);

  // A parent in tenant A, guardian of the FIRST child only.
  alphaParentId = await createTestUser(A.parentEmail, "Alpha Parent");
  await admin.from("profiles").upsert(
    { id: alphaParentId, tenant_id: alpha.tenantId, role: "parent", email: A.parentEmail },
    { onConflict: "id" },
  );
  await admin.from("guardians").insert({
    tenant_id: alpha.tenantId,
    child_id: alpha.childIds[0],
    profile_id: alphaParentId,
    is_primary: true,
  });

  // A teacher in tenant A, assigned to its only class.
  const teacherId = await createTestUser(A.teacherEmail, "Alpha Teacher");
  await admin.from("profiles").upsert(
    { id: teacherId, tenant_id: alpha.tenantId, role: "teacher", email: A.teacherEmail },
    { onConflict: "id" },
  );
  await admin.from("class_teachers").insert({
    tenant_id: alpha.tenantId,
    class_id: alpha.classId,
    profile_id: teacherId,
  });

  alphaOwner = await clientForUser(alpha.ownerId);
  alphaParent = await clientForUser(alphaParentId);
  alphaTeacher = await clientForUser(teacherId);
}, 120_000);

afterAll(teardown, 60_000);

describe.skipIf(!RUN)("cross-tenant reads are impossible", () => {
  it("an owner of A sees only A's children", async () => {
    const { data, error } = await alphaOwner.from("children").select("id, tenant_id");
    expect(error).toBeNull();

    const ids = (data as { id: string; tenant_id: string }[]).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(alpha.childIds));
    for (const betaChild of beta.childIds) {
      expect(ids).not.toContain(betaChild);
    }
    for (const row of data as { tenant_id: string }[]) {
      expect(row.tenant_id).toBe(alpha.tenantId);
    }
  });

  it("fetching B's child by its exact id returns nothing", async () => {
    const { data, error } = await alphaOwner
      .from("children")
      .select("*")
      .eq("id", beta.childIds[0])
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("filtering explicitly by B's tenant_id still returns nothing", async () => {
    const { data } = await alphaOwner
      .from("children")
      .select("*")
      .eq("tenant_id", beta.tenantId);

    expect(data ?? []).toHaveLength(0);
  });

  it.each([
    "attendance_records",
    "child_allergies",
    "enrollments",
    "fees",
    "classes",
    "academic_years",
    "daily_reports",
    "incidents",
    "announcements",
    "applications",
    "audit_logs",
    "invitations",
  ])("no row from tenant B leaks through %s", async (table) => {
    const { data } = await alphaOwner.from(table).select("tenant_id");
    for (const row of (data ?? []) as { tenant_id: string | null }[]) {
      expect(row.tenant_id).not.toBe(beta.tenantId);
    }
  });

  it("A's owner cannot see B's tenant record", async () => {
    const { data } = await alphaOwner.from("tenants").select("id, slug");
    const slugs = (data as { slug: string }[]).map((row) => row.slug);
    expect(slugs).toContain(A.slug);
    expect(slugs).not.toContain(B.slug);
  });

  it("A's owner cannot enumerate B's staff", async () => {
    const { data } = await alphaOwner.from("profiles").select("email, tenant_id");
    const emails = (data as { email: string }[]).map((row) => row.email);
    expect(emails).not.toContain(B.ownerEmail);
  });
});

describe.skipIf(!RUN)("cross-tenant writes are refused", () => {
  it("inserting a child into tenant B fails", async () => {
    const { error } = await alphaOwner.from("children").insert({
      tenant_id: beta.tenantId,
      first_name: "Injected",
      last_name: "Child",
      date_of_birth: "2022-01-01",
    });

    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("row-level security");
  });

  it("updating B's child affects no rows", async () => {
    const { data, error } = await alphaOwner
      .from("children")
      .update({ first_name: "Hacked" })
      .eq("id", beta.childIds[0])
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // And confirm from a privileged client that the row is untouched.
    const { data: check } = await admin
      .from("children")
      .select("first_name")
      .eq("id", beta.childIds[0])
      .single();
    expect((check as { first_name: string }).first_name).toBe("Child");
  });

  it("deleting B's child affects no rows", async () => {
    await alphaOwner.from("children").delete().eq("id", beta.childIds[0]);

    const { count } = await admin
      .from("children")
      .select("id", { count: "exact", head: true })
      .eq("id", beta.childIds[0]);
    expect(count).toBe(1);
  });

  it("recording attendance against B's child fails", async () => {
    const { error } = await alphaOwner.from("attendance_records").insert({
      tenant_id: beta.tenantId,
      academic_year_id: beta.yearId,
      child_id: beta.childIds[0],
      attendance_date: "2025-09-03",
      status: "present",
    });

    expect(error).not.toBeNull();
  });

  it("a user cannot move themselves into another tenant", async () => {
    const { error } = await alphaOwner
      .from("profiles")
      .update({ tenant_id: beta.tenantId })
      .eq("id", alpha.ownerId);

    expect(error).not.toBeNull();
    expect(error?.message).toContain("immutable");
  });

  it("a user cannot promote themselves to super_admin", async () => {
    const { error } = await alphaParent
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", alphaParentId);

    expect(error).not.toBeNull();
  });

  it("a school admin cannot change their own subscription status", async () => {
    const { error } = await alphaOwner
      .from("tenants")
      .update({ subscription_status: "active", plan: "enterprise" })
      .eq("id", alpha.tenantId);

    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("super-admin");
  });
});

describe.skipIf(!RUN)("parents see only their own children", () => {
  it("a parent reads exactly one child", async () => {
    const { data, error } = await alphaParent.from("children").select("id");
    expect(error).toBeNull();

    const ids = (data as { id: string }[]).map((row) => row.id);
    expect(ids).toEqual([alpha.childIds[0]]);
    expect(ids).not.toContain(alpha.childIds[1]);
  });

  it("a parent cannot read another family's child by id", async () => {
    const { data } = await alphaParent
      .from("children")
      .select("*")
      .eq("id", alpha.childIds[1])
      .maybeSingle();

    expect(data).toBeNull();
  });

  it("a parent cannot read another child's allergies", async () => {
    const { data } = await alphaParent
      .from("child_allergies")
      .select("child_id")
      .eq("child_id", alpha.childIds[1]);

    expect(data ?? []).toHaveLength(0);
  });

  it("a parent cannot see the school ledger", async () => {
    const { data } = await alphaParent.from("transactions").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("a parent cannot record attendance", async () => {
    const { error } = await alphaParent.from("attendance_records").insert({
      tenant_id: alpha.tenantId,
      academic_year_id: alpha.yearId,
      child_id: alpha.childIds[0],
      attendance_date: "2025-09-04",
      status: "present",
    });

    expect(error).not.toBeNull();
  });
});

describe.skipIf(!RUN)("teachers are scoped to their classes", () => {
  it("a teacher sees the children in their class", async () => {
    const { data, error } = await alphaTeacher.from("children").select("id");
    expect(error).toBeNull();

    const ids = (data as { id: string }[]).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(alpha.childIds));
  });

  it("a teacher cannot reach tenant B at all", async () => {
    const { data } = await alphaTeacher
      .from("children")
      .select("id")
      .eq("tenant_id", beta.tenantId);

    expect(data ?? []).toHaveLength(0);
  });

  it("a teacher cannot create a class", async () => {
    const { error } = await alphaTeacher.from("classes").insert({
      tenant_id: alpha.tenantId,
      academic_year_id: alpha.yearId,
      name: "Unauthorised room",
      capacity: 5,
    });

    expect(error).not.toBeNull();
  });
});

describe.skipIf(!RUN)("suspended tenants become read-only, never deleted", () => {
  it("writes are refused while suspended and restored on reactivation", async () => {
    // Suspend tenant A from the platform side.
    await admin
      .from("tenants")
      .update({ subscription_status: "suspended" })
      .eq("id", alpha.tenantId);

    // Reads keep working — this is the whole point of a soft lock.
    const { data: readWhileSuspended, error: readError } = await alphaOwner
      .from("children")
      .select("id");
    expect(readError).toBeNull();
    expect((readWhileSuspended ?? []).length).toBeGreaterThan(0);

    // Writes do not.
    const { error: writeError } = await alphaOwner.from("children").insert({
      tenant_id: alpha.tenantId,
      first_name: "Should",
      last_name: "Fail",
      date_of_birth: "2022-03-03",
    });
    expect(writeError).not.toBeNull();

    // Nothing was destroyed by the suspension.
    const { count } = await admin
      .from("children")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", alpha.tenantId);
    expect(count).toBe(alpha.childIds.length);

    // Reactivating restores write access immediately, with no other steps.
    await admin
      .from("tenants")
      .update({ subscription_status: "active" })
      .eq("id", alpha.tenantId);

    const { error: afterError } = await alphaOwner.from("children").insert({
      tenant_id: alpha.tenantId,
      first_name: "Now",
      last_name: "Allowed",
      date_of_birth: "2022-04-04",
    });
    expect(afterError).toBeNull();
  });
});

describe.skipIf(!RUN)("anonymous access is closed", () => {
  it("an unauthenticated client reads nothing", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, ANON_KEY } = await import("./helpers/supabase");

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const table of ["children", "child_allergies", "attendance_records", "profiles"]) {
      const { data } = await anon.from(table).select("id");
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("an unauthenticated client cannot submit an application directly", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, ANON_KEY } = await import("./helpers/supabase");

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await anon.from("applications").insert({
      tenant_id: alpha.tenantId,
      academic_year_id: alpha.yearId,
      child_first_name: "Spam",
      child_last_name: "Entry",
      date_of_birth: "2022-01-01",
      parent_name: "Spammer",
      parent_email: "spam@example.com",
      parent_phone: "+10000000000",
    });

    // Admissions go through a validated, rate-limited server action instead.
    expect(error).not.toBeNull();
  });
});

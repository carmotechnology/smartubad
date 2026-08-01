/**
 * Seed script — two demo kindergartens with full, isolated data.
 *
 *   npm run seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * `.env.local`, and the migrations in `supabase/migrations` to have been run
 * first. It uses the service-role client, so it bypasses RLS by design.
 *
 * Safe to re-run: it deletes and recreates only the two demo tenants, matched
 * by their slugs. It never touches anything else in the database.
 *
 * Demo accounts are created as real Supabase Auth users with confirmed emails,
 * so you can sign in as any of them with a magic link in development.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\n  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Add them to .env.local before running the seed.\n",
  );
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const db: SupabaseClient<any, "public", any> = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEMO_SLUGS = ["little-stars", "sunrise-academy"];

type DemoUser = { email: string; name: string; role: string };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function ensureAuthUser(email: string, name: string): Promise<string> {
  // The admin API has no "get by email", so page through until we find them.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return existing.id;

  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  return data.user.id;
}

async function wipeTenant(slug: string) {
  const { data } = await db.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (!data) return;

  // Every tenant-owned table cascades from `tenants`, so one delete is enough.
  await db.from("tenants").delete().eq("id", (data as { id: string }).id);
}

async function seedTenant(options: {
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  locale: string;
  subscriptionStatus: string;
  accentColor: string;
  users: { owner: DemoUser; teacher: DemoUser; parent: DemoUser };
  classNames: [string, string];
  withSevereAllergy: boolean;
}) {
  console.log(`\n  ${options.name} (/${options.slug})`);

  const { data: tenantData, error: tenantError } = await db
    .from("tenants")
    .insert({
      name: options.name,
      slug: options.slug,
      accent_color: options.accentColor,
      tagline: "Where every child is known by name",
      city: options.timezone.split("/")[1]?.replace("_", " ") ?? "",
      country: options.timezone.startsWith("Africa") ? "Somalia" : "United Kingdom",
      phone: "+252 61 000 0000",
      contact_email: options.users.owner.email,
      timezone: options.timezone,
      locale: options.locale,
      currency: options.currency,
      plan: "standard",
      subscription_status: options.subscriptionStatus,
    })
    .select("id")
    .single();

  if (tenantError) throw tenantError;
  const tenantId = (tenantData as { id: string }).id;

  // --- Academic years: one closed (history), one active -------------------
  const { data: years, error: yearError } = await db
    .from("academic_years")
    .insert([
      {
        tenant_id: tenantId,
        name: "2024–2025",
        start_date: "2024-09-01",
        end_date: "2025-07-15",
        is_active: false,
      },
      {
        tenant_id: tenantId,
        name: "2025–2026",
        start_date: "2025-09-01",
        end_date: "2026-07-15",
        is_active: true,
      },
    ])
    .select("id, is_active");
  if (yearError) throw yearError;

  const activeYearId = (years as { id: string; is_active: boolean }[]).find(
    (year) => year.is_active,
  )!.id;

  await db.from("terms").insert([
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      name: "Term 1",
      start_date: "2025-09-01",
      end_date: "2025-12-15",
    },
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      name: "Term 2",
      start_date: "2026-01-08",
      end_date: "2026-04-02",
    },
  ]);

  // --- People --------------------------------------------------------------
  const ownerId = await ensureAuthUser(options.users.owner.email, options.users.owner.name);
  const teacherId = await ensureAuthUser(
    options.users.teacher.email,
    options.users.teacher.name,
  );
  const parentId = await ensureAuthUser(options.users.parent.email, options.users.parent.name);

  const { error: profileError } = await db.from("profiles").upsert(
    [
      {
        id: ownerId,
        tenant_id: tenantId,
        role: "owner",
        email: options.users.owner.email,
        full_name: options.users.owner.name,
        locale: options.locale,
      },
      {
        id: teacherId,
        tenant_id: tenantId,
        role: "teacher",
        email: options.users.teacher.email,
        full_name: options.users.teacher.name,
        locale: options.locale,
      },
      {
        id: parentId,
        tenant_id: tenantId,
        role: "parent",
        email: options.users.parent.email,
        full_name: options.users.parent.name,
        locale: options.locale,
      },
    ],
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  // --- Classes -------------------------------------------------------------
  const { data: classes, error: classError } = await db
    .from("classes")
    .insert([
      {
        tenant_id: tenantId,
        academic_year_id: activeYearId,
        name: options.classNames[0],
        room: "Room 1",
        capacity: 15,
        age_range: "2–3",
      },
      {
        tenant_id: tenantId,
        academic_year_id: activeYearId,
        name: options.classNames[1],
        room: "Room 2",
        capacity: 20,
        age_range: "3–5",
      },
    ])
    .select("id, name");
  if (classError) throw classError;

  const classRows = classes as { id: string; name: string }[];
  const firstClassId = classRows[0].id;

  await db.from("class_teachers").insert({
    tenant_id: tenantId,
    class_id: firstClassId,
    profile_id: teacherId,
    is_lead: true,
  });

  // --- Children ------------------------------------------------------------
  const childSeeds = [
    { first: "Amina", last: "Hassan", dob: "2022-03-14", gender: "female" },
    { first: "Yusuf", last: "Ali", dob: "2022-07-02", gender: "male" },
    { first: "Layla", last: "Omar", dob: "2021-11-20", gender: "female" },
    { first: "Ibrahim", last: "Nur", dob: "2021-05-09", gender: "male" },
    { first: "Sagal", last: "Warsame", dob: "2022-01-30", gender: "female" },
  ];

  const { data: children, error: childError } = await db
    .from("children")
    .insert(
      childSeeds.map((child) => ({
        tenant_id: tenantId,
        first_name: child.first,
        last_name: child.last,
        date_of_birth: child.dob,
        gender: child.gender,
        status: "active",
      })),
    )
    .select("id, first_name");
  if (childError) throw childError;

  const childRows = children as { id: string; first_name: string }[];

  await db.from("enrollments").insert(
    childRows.map((child, index) => ({
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      child_id: child.id,
      class_id: index < 3 ? firstClassId : classRows[1].id,
      status: "active",
    })),
  );

  // The parent guards the first two children only — this is what the
  // cross-child isolation tests assert against.
  await db.from("guardians").insert(
    childRows.slice(0, 2).map((child, index) => ({
      tenant_id: tenantId,
      child_id: child.id,
      profile_id: parentId,
      relationship: "Mother",
      is_primary: index === 0,
      can_pickup: true,
    })),
  );

  await db.from("emergency_contacts").insert(
    childRows.map((child) => ({
      tenant_id: tenantId,
      child_id: child.id,
      name: options.users.parent.name,
      relationship: "Mother",
      phone: "+252 61 555 0101",
      email: options.users.parent.email,
      priority: 1,
    })),
  );

  // --- ALLERGIES (the safety UI is only testable if this exists) ----------
  const allergyRows: Record<string, unknown>[] = [
    {
      tenant_id: tenantId,
      child_id: childRows[0].id,
      allergen: "Peanuts",
      severity: options.withSevereAllergy ? "severe" : "moderate",
      reaction: "Anaphylaxis — swelling of the face and difficulty breathing",
      required_action:
        "Administer the EpiPen from the red pouch immediately, call emergency services, then call the parent. Do not leave the child alone.",
      medication: "EpiPen Jr 0.15mg",
      medication_location: "Red pouch in the child's bag, front pocket",
    },
    {
      tenant_id: tenantId,
      child_id: childRows[1].id,
      allergen: "Cow's milk",
      severity: "mild",
      reaction: "Stomach upset and a rash around the mouth",
      required_action:
        "Offer the oat milk labelled with the child's name. Wash the affected skin and note it in the daily report.",
    },
    {
      tenant_id: tenantId,
      child_id: childRows[2].id,
      allergen: "Bee stings",
      severity: "moderate",
      reaction: "Significant local swelling",
      required_action:
        "Remove the sting, apply a cold compress, monitor breathing for 30 minutes and telephone the parent.",
    },
  ];

  const { error: allergyError } = await db.from("child_allergies").insert(allergyRows);
  if (allergyError) throw allergyError;

  await db.from("child_medical_notes").insert({
    tenant_id: tenantId,
    child_id: childRows[2].id,
    title: "Mild asthma",
    details: "Symptoms appear with heavy exercise or in cold weather.",
    medication: "Blue salbutamol inhaler",
    action_plan: "Two puffs through the spacer, sit the child upright, call the parent if breathing does not settle within ten minutes.",
    doctor_name: "Dr. Farah",
    doctor_phone: "+252 61 555 0199",
  });

  // --- A week of attendance ------------------------------------------------
  const attendanceRows: Record<string, unknown>[] = [];
  for (let dayOffset = 1; dayOffset <= 5; dayOffset += 1) {
    const date = isoDaysAgo(dayOffset);
    for (const [index, child] of childRows.entries()) {
      const absent = (index + dayOffset) % 7 === 0;
      attendanceRows.push({
        tenant_id: tenantId,
        academic_year_id: activeYearId,
        child_id: child.id,
        class_id: index < 3 ? firstClassId : classRows[1].id,
        attendance_date: date,
        status: absent ? "absent" : index % 4 === 3 ? "late" : "present",
        check_in_at: absent ? null : `${date}T08:${index < 3 ? "05" : "20"}:00Z`,
        check_out_at: absent ? null : `${date}T15:30:00Z`,
        dropped_off_by: absent ? null : "Mother",
        picked_up_by: absent ? null : "Mother",
        recorded_by: teacherId,
      });
    }
  }
  const { error: attendanceError } = await db
    .from("attendance_records")
    .insert(attendanceRows);
  if (attendanceError) throw attendanceError;

  // --- Daily reports -------------------------------------------------------
  await db.from("daily_reports").insert(
    childRows.slice(0, 3).map((child, index) => ({
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      child_id: child.id,
      class_id: firstClassId,
      report_date: isoDaysAgo(1),
      mood: ["happy", "calm", "tired"][index],
      meals: [
        { type: "breakfast", amount: "most" },
        { type: "lunch", amount: index === 2 ? "some" : "all" },
      ],
      naps: [{ from: "12:30", to: "13:45" }],
      activities: "Water play in the garden, then story time and painting.",
      notes: "Settled well and played happily with the others.",
      is_published: true,
      published_at: new Date().toISOString(),
      created_by: teacherId,
    })),
  );

  // --- Communication -------------------------------------------------------
  await db.from("announcements").insert([
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      audience: "school",
      title: "Parent–teacher meetings next week",
      body: "We will be holding short meetings with every family. Please sign up for a slot at the front desk.",
      is_pinned: true,
      created_by: ownerId,
    },
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      audience: "class",
      class_id: firstClassId,
      title: "Wellington boots, please",
      body: "We are spending more time in the garden. Please send your child with boots and a warm coat.",
      created_by: teacherId,
    },
  ]);

  await db.from("calendar_events").insert([
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      title: "Parent–teacher meetings",
      event_type: "meeting",
      starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      all_day: true,
      visible_to_parents: true,
      created_by: ownerId,
    },
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      title: "Mid-term break",
      event_type: "holiday",
      starts_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      all_day: true,
      visible_to_parents: true,
      created_by: ownerId,
    },
  ]);

  // --- Health --------------------------------------------------------------
  await db.from("incidents").insert({
    tenant_id: tenantId,
    academic_year_id: activeYearId,
    child_id: childRows[3].id,
    class_id: classRows[1].id,
    incident_type: "injury",
    occurred_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    location: "Garden",
    description: "Tripped while running and grazed the left knee.",
    action_taken: "Cleaned the graze, applied a plaster, comforted and returned to play.",
    parent_notified_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    reported_by: teacherId,
    notified_by: teacherId,
  });

  // --- Finance -------------------------------------------------------------
  const { data: fees, error: feeError } = await db
    .from("fees")
    .insert(
      childRows.map((child, index) => ({
        tenant_id: tenantId,
        academic_year_id: activeYearId,
        child_id: child.id,
        description: "Term 1 tuition",
        amount_minor: 15000 + index * 1000,
        currency: options.currency,
        due_date: isoDaysAgo(-14),
      })),
    )
    .select("id");
  if (feeError) throw feeError;

  const feeRows = fees as { id: string }[];

  // Two families have paid in full, one partially — enough to exercise every
  // fee status on the dashboard.
  await db.from("fee_payments").insert([
    {
      tenant_id: tenantId,
      fee_id: feeRows[0].id,
      amount_minor: 15000,
      paid_on: isoDaysAgo(10),
      method: "mobile_money",
      recorded_by: ownerId,
    },
    {
      tenant_id: tenantId,
      fee_id: feeRows[1].id,
      amount_minor: 16000,
      paid_on: isoDaysAgo(8),
      method: "cash",
      recorded_by: ownerId,
    },
    {
      tenant_id: tenantId,
      fee_id: feeRows[2].id,
      amount_minor: 8000,
      paid_on: isoDaysAgo(5),
      method: "cash",
      recorded_by: ownerId,
    },
  ]);

  await db.from("transactions").insert([
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      kind: "income",
      category: "tuition",
      description: "Term 1 fees collected",
      amount_minor: 39000,
      currency: options.currency,
      occurred_on: isoDaysAgo(8),
      recorded_by: ownerId,
    },
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      kind: "expense",
      category: "salaries",
      description: "Staff salaries",
      amount_minor: 22000,
      currency: options.currency,
      occurred_on: isoDaysAgo(6),
      recorded_by: ownerId,
    },
    {
      tenant_id: tenantId,
      academic_year_id: activeYearId,
      kind: "expense",
      category: "supplies",
      description: "Art materials and snacks",
      amount_minor: 4500,
      currency: options.currency,
      occurred_on: isoDaysAgo(3),
      recorded_by: ownerId,
    },
  ]);

  // --- A pending application, with allergies declared up front -------------
  await db.from("applications").insert({
    tenant_id: tenantId,
    academic_year_id: activeYearId,
    child_first_name: "Hodan",
    child_last_name: "Abdi",
    date_of_birth: "2022-09-12",
    gender: "female",
    parent_name: "Fadumo Abdi",
    parent_email: "fadumo.demo@example.com",
    parent_phone: "+252 61 555 0144",
    allergies: [
      {
        allergen: "Eggs",
        severity: "moderate",
        reaction: "Hives and vomiting",
        requiredAction: "Avoid all egg products, give antihistamine if prescribed and call the parent.",
      },
    ],
    medical_notes: "No other conditions.",
    status: "pending",
  });

  console.log(
    `    ${childRows.length} children · ${classRows.length} classes · ` +
      `${attendanceRows.length} attendance records · status: ${options.subscriptionStatus}`,
  );

  return { tenantId, users: options.users };
}

async function main() {
  console.log("\nSeeding Smartubad demo data…");

  for (const slug of DEMO_SLUGS) {
    await wipeTenant(slug);
  }

  const first = await seedTenant({
    name: "Little Stars Kindergarten",
    slug: "little-stars",
    currency: "USD",
    timezone: "Africa/Mogadishu",
    locale: "en",
    subscriptionStatus: "active",
    accentColor: "#2a9d9c",
    classNames: ["Toddlers A", "Preschool B"],
    withSevereAllergy: true,
    users: {
      owner: { email: "owner.littlestars@example.com", name: "Khadija Warsame", role: "owner" },
      teacher: { email: "teacher.littlestars@example.com", name: "Amal Jama", role: "teacher" },
      parent: { email: "parent.littlestars@example.com", name: "Halima Hassan", role: "parent" },
    },
  });

  const second = await seedTenant({
    name: "Sunrise Academy",
    slug: "sunrise-academy",
    currency: "SOS",
    timezone: "Africa/Mogadishu",
    locale: "so",
    // Deliberately trialing rather than active, so the two states are both
    // represented and the super-admin panel has something to switch.
    subscriptionStatus: "trialing",
    accentColor: "#c2703d",
    classNames: ["Qaybta Yaryar", "Qaybta Weyn"],
    withSevereAllergy: false,
    users: {
      owner: { email: "owner.sunrise@example.com", name: "Abdirahman Yusuf", role: "owner" },
      teacher: { email: "teacher.sunrise@example.com", name: "Nasteexo Ahmed", role: "teacher" },
      parent: { email: "parent.sunrise@example.com", name: "Maryan Farah", role: "parent" },
    },
  });

  console.log(`
Done.

  Two demo schools are ready. Sign in with a magic link at /login using any of:

    Little Stars (/little-stars, English, active)
      owner    ${first.users.owner.email}
      teacher  ${first.users.teacher.email}   (assigned to Toddlers A)
      parent   ${first.users.parent.email}   (guardian of Amina and Yusuf only)

    Sunrise Academy (/sunrise-academy, Somali, trialing)
      owner    ${second.users.owner.email}
      teacher  ${second.users.teacher.email}
      parent   ${second.users.parent.email}

  Amina Hassan at Little Stars has a SEVERE peanut allergy — open the class
  roster or her profile to see the safety UI.

  To reach the super-admin panel, sign in with an address listed in
  SUPER_ADMIN_EMAILS; the profile is created on first sign-in.
`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error);
  process.exit(1);
});

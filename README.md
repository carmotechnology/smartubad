# Smartubad

A multi-tenant kindergarten management system. Several independent schools each
run their own children, staff, classes, attendance, finance and parent
communication, in complete isolation from one another.

Built for phones first — a teacher takes the register one-handed while holding a
clipboard — and for safety: a child's allergies are structured data that follow
them onto every screen where they matter.

---

## Contents

1. [Stack](#stack)
2. [Getting started](#getting-started)
3. [Running the migrations](#running-the-migrations)
4. [How multi-tenancy works](#how-multi-tenancy-works)
5. [Academic years](#academic-years)
6. [Roles and permissions](#roles-and-permissions)
7. [The invitation flow](#the-invitation-flow)
8. [Subscription and read-only mode](#subscription-and-read-only-mode)
9. [Allergies and child safety](#allergies-and-child-safety)
10. [Internationalisation](#internationalisation)
11. [Notifications](#notifications)
12. [Testing](#testing)
13. [Deploying to Vercel](#deploying-to-vercel)
14. [Project layout](#project-layout)
15. [Environment variables](#environment-variables)
16. [Deliberately not in v1](#deliberately-not-in-v1)

---

## Stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Frontend   | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Components | shadcn/ui-style primitives on Radix                |
| Backend    | Next.js server actions and route handlers          |
| Database   | Supabase PostgreSQL with row-level security        |
| Auth       | Supabase Auth — Google OAuth, magic-link fallback  |
| Storage    | Supabase Storage (logos, photos, documents)        |
| Validation | Zod                                                |
| Tests      | Vitest                                             |
| Hosting    | Vercel                                             |

Business logic lives in the application layer. The database is used for schema,
RLS and storage — nothing exotic — so it stays portable to any managed Postgres.

**Payments: none in v1.** Tenant access is controlled manually by the platform
super-admin. The data model is payment-ready so a processor can be added later
without rework.

---

## Getting started

Requires **Node 20.9+**; Node 22 is recommended (the Supabase client warns on 20
and Vercel should be pinned to 22).

```bash
git clone https://github.com/carmotechnology/smartubad.git
cd smartubad
npm install
cp .env.example .env.local     # then fill it in — see Environment variables
```

Run the migrations against your Supabase project (see the next section), then:

```bash
npm run seed     # optional: two demo schools with realistic data
npm run dev      # http://localhost:3000
```

### Supabase Auth setup

In your Supabase dashboard:

1. **Authentication → Providers → Google** — enable it, and paste in a Google
   OAuth client ID and secret from the Google Cloud console.
2. In Google Cloud, add this authorised redirect URI:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. **Authentication → URL Configuration** — set the Site URL to your app URL and
   add `http://localhost:3000/**` plus your production URL to the redirect
   allow-list.
4. **Authentication → Providers → Email** — leave magic links enabled. You can
   turn off "Confirm email" only if you want a faster local loop.

---

## Running the migrations

> **The Supabase project is yours and is managed manually.** Nothing in this
> repository provisions, resets or migrates a database on its own. The schema
> ships as plain, reviewable `.sql` files for you to read and run yourself.

The files in [`supabase/migrations/`](supabase/migrations/) are numbered and
**must be run in order**:

| File                                | What it does                                          |
| ----------------------------------- | ----------------------------------------------------- |
| `0001_extensions_and_enums.sql`     | Extensions, the private `app` schema, all enum types  |
| `0002_tenancy_and_identity.sql`     | `tenants`, `profiles`, `invitations`, `audit_logs`    |
| `0003_academic_structure.sql`       | Academic years, terms, classes, class–teacher links   |
| `0004_children_and_safety.sql`      | Children, enrolments, guardians, **allergies**        |
| `0005_daily_operations.sql`         | Attendance, daily reports, announcements, incidents   |
| `0006_finance_and_admissions.sql`   | Fees, payments, ledger, admission applications        |
| `0007_rls_helpers.sql`              | RLS helper functions and privilege-escalation guards  |
| `0008_rls_policies.sql`             | Policies: grants, tenants, profiles, invitations      |
| `0009_rls_policies_children.sql`    | Policies: academic structure and children             |
| `0010_rls_policies_operations.sql`  | Policies: operations, finance, admissions + **coverage check** |
| `0011_storage.sql`                  | Storage buckets and object-level policies             |

**The easiest way:** open the Supabase SQL editor, paste each file's contents in
order, and run it. Each file is idempotent enough to re-run safely.

**With the CLI**, if you prefer:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

### The coverage check

The end of `0010` runs a `DO` block that inspects every table in `public` and
**fails the migration** if any of them is missing RLS, missing a `tenant_id`
column, or has RLS enabled with no policies (which silently denies everything —
just as much a bug). If it succeeds you will see:

```
NOTICE: RLS coverage check passed: every public table has tenant_id + RLS + policies.
```

That check is the enforcement mechanism behind the project's one
non-negotiable rule, so please do not delete it when adding a table.

---

## How multi-tenancy works

**One shared database. Every tenant-owned table carries a `tenant_id`.** Simpler
to operate than schema-per-tenant, and correct at this stage.

Isolation is enforced **twice, independently**:

### 1. Row-level security, in Postgres

Every tenant-owned table has RLS enabled and a policy comparing the row's
`tenant_id` against the caller's. The caller's tenant is resolved from their
profile by a `SECURITY DEFINER` helper:

```sql
create function app.current_tenant_id() returns uuid
language sql stable security definer
as $$ select tenant_id from public.profiles where id = auth.uid() and is_active $$;
```

Policies are then written against it:

```sql
create policy children_select on public.children
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(id));
```

The application always talks to Postgres as the `authenticated` role carrying
the user's JWT, so these policies are live on every single query. **A bug in the
application cannot leak another school's data**, because the database refuses
before the application is consulted.

### 2. The tenant-scoped data-access layer, in the app

Feature code never calls `supabase.from(...)` on a tenant-owned table. It goes
through [`TenantScope`](src/lib/db/scope.ts), which:

- appends `.eq('tenant_id', …)` to every read;
- stamps `tenant_id` on every insert from the **session**, never from input, and
  throws `ForbiddenError` if a payload carries a different one;
- constrains updates and deletes to the caller's tenant;
- refuses writes when the subscription is inactive.

```ts
const ctx = await requireTenantContext(tenantSlug); // identity from session
const db = scoped(ctx);
const { data } = await db.select("children").order("first_name");
```

`requireTenantContext` is the gate. Note what it does **not** do: it never
takes a tenant id from the request. The slug in the URL only looks a tenant up;
that tenant is then checked against the one on the caller's profile. Editing the
slug in the address bar produces a 404, not somebody else's school.

### Where the service-role client is used, and why

The service-role key bypasses RLS. It is used in exactly five places, each of
which does its own authorisation check first:

1. **Invite acceptance** — must write a profile *before* one exists.
2. **Super-admin tenant management** — crosses tenants by design.
3. **Public admission intake** — the applicant has no account.
4. **Audit logging** — must not be forgeable by the acting user.
5. **The seed script.**

---

## Academic years

Academic years are foundational, not an afterthought. Enrolments, classes,
attendance, reports, events and finance all carry `academic_year_id` alongside
`tenant_id`.

- An admin creates a year (name, start date, end date) in **Settings**.
- **Exactly one year is active per tenant** — enforced by a partial unique index,
  not just by application code.
- Closed years stay fully **readable as history** and are frozen for writes
  (`TenantScope.assertYearWritable`).
- **Rollover is manual in v1**: create the new year, create its classes, re-enrol
  the children. Automated bulk promotion is a later phase.

A child's record is permanent; their *enrolment* is what belongs to a year. That
is what makes rollover clean and history honest.

---

## Roles and permissions

| Role            | Scope                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| **Super admin** | The platform. Creates schools, sets slug/plan/status, sees **aggregate counts only**. |
| **Owner**       | Everything inside their own school.                                     |
| **Admin**       | Same as owner in v1 (kept separate so they can diverge).                |
| **Teacher**     | Their assigned classes: attendance, reports, incidents, class notices.  |
| **Parent**      | Their **own children only**: attendance, reports, announcements, fees.  |

The permission matrix lives in [`src/lib/auth/rbac.ts`](src/lib/auth/rbac.ts) and
mirrors the RLS policies. It exists so the UI can hide what a role cannot do and
so actions fail with a clear message — **it is not the enforcement boundary.**
RLS is. Adding a permission there grants nothing on its own.

A super-admin deliberately holds **no** tenant-content permission.
`requireTenantContext` refuses them outright, so there is no route from the
platform panel into a school's children, reports or messages.

---

## The invitation flow

**Nobody signs themselves up.** Every account is created by an invitation, and
`tenant_id` and `role` come from that invitation — never from the user.

```
Super-admin ──invites──▶ School owner ──invites──▶ Teachers & admins
                                      └──invites──▶ Parents (bound to children)
```

### What happens

1. The inviter enters an email address and picks a role (plus classes for a
   teacher, or children for a parent).
2. The server generates a 256-bit random token. **Only its SHA-256 hash is
   stored**, so a database leak yields no usable invite links.
3. The recipient gets a link to `/invite/{token}` and taps **Continue with
   Google**.
4. `/auth/callback` exchanges the code for a session and then performs the
   check that makes the whole thing safe:

```ts
if (!userEmail || userEmail !== invitedEmail) {
  await recordAudit({ action: "invite.reject_email_mismatch", ... });
  return { ok: false, reason: "email_mismatch" };
}
```

5. On a match, the profile is provisioned from the invitation row and the
   invitation is atomically claimed (`.eq("status", "pending")`), so a
   double-click cannot create two profiles.
6. On a mismatch, the session is signed out and the visitor is told which
   address to use.

### The rules, in one place

- Single-use, and expiring (default 72 hours, `INVITE_TOKEN_TTL_HOURS`).
- Bound to **email + tenant + role** at creation.
- **The email match is mandatory** — without it, anyone holding the link could
  walk in with any Google account.
- One live invite per (tenant, email); issuing a new one revokes the old.
- Expired or used tokens require a fresh invitation.
- Magic-link sign-in is offered as a fallback and is inherently email-bound,
  and `shouldCreateUser` is false outside the invite flow — so an uninvited
  address cannot mint an account.
- Acceptance attempts are rate-limited per IP.

### Bootstrapping the first super-admin

There is one account not created by an invitation: the platform owner. List your
address in `SUPER_ADMIN_EMAILS`, sign in with Google, and the `super_admin`
profile is created on first sign-in. The gate is an environment variable you
control, never anything user-supplied.

---

## Subscription and read-only mode

There is no payment processor in v1. Each tenant has a `subscription_status` set
**manually by the super-admin** from the platform panel:

| Status               | Effect                              |
| -------------------- | ----------------------------------- |
| `trialing`, `active` | Full read and write access          |
| `past_due`, `suspended` | **Read-only.** Everything is still visible; nothing can be added or changed |

Enforcement is **soft and non-destructive** — data is never deleted for
non-payment — and it is enforced server-side in three layers:

1. `assertWritable(ctx)` in every write action.
2. `TenantScope` refuses insert/update/delete/upsert.
3. `app.tenant_writable()` in the RLS `WITH CHECK` of every write policy.

The UI shows a banner and hides write controls, but that is courtesy. The moment
the super-admin sets the tenant back to `active`, write access returns
immediately with no further steps.

---

## Allergies and child safety

Allergies are **structured, first-class data** — never a free-text note:

```
allergen + severity + reaction + required action  (+ medication, and where it is kept)
```

They appear, unavoidably, on:

- **The class attendance roster** — a badge next to the child, red for severe.
- **The child detail view** — a banner rendered *above* the name and photo, so a
  teacher opening a child from the register sees the warning first. It states
  the required action in a highlighted block.
- **The admission form** — collected up front, before the first day, and carried
  straight into the child's record on approval.

Read access is deliberately as wide as child access: a teacher must never be
unable to see why a child cannot eat something. Write access is admin-only, so
allergy records cannot be casually altered.

The seed data includes a child with a **severe** peanut allergy so the safety UI
is testable the moment you sign in.

---

## Internationalisation

English is the default; Somali is fully translated. The switcher is in the
sidebar and on every public page.

- Dictionaries: [`src/lib/i18n/dictionaries/`](src/lib/i18n/dictionaries/)
- `so.ts` is typed as `Dictionary`, so **a missing Somali key is a build error**,
  and a test asserts key-for-key parity.
- The locale is stored in a cookie rather than a URL segment, so no route needs a
  `/[locale]/` prefix and a user's choice follows them between schools.
- Precedence: the user's explicit choice → the school's default → English.

---

## Notifications

Email only in v1, behind a single interface:

```ts
await sendNotification({
  to: { email, phone, name },
  subject: "…",
  text: "…",
  channels: ["email"],        // add "sms" later; no call site changes
});
```

- Provider: Resend, or `console` in development, which logs the message instead
  of mailing a real parent from a laptop.
- **SMS is interface-ready but not enabled.** Adding Hormuud means implementing
  `sendSms` in [`src/lib/notifications/index.ts`](src/lib/notifications/index.ts)
  and setting `SMS_PROVIDER=hormuud`. Nothing else changes.
- Credentials stay in server-side environment variables.

---

## Testing

```bash
npm test              # everything
npm run typecheck     # tsc --noEmit
npm run build         # production build
```

Two suites:

**`tests/rbac.test.ts`** — pure unit tests. No database, runs anywhere. Covers
the permission matrix, allergy severity ranking, money conversion to minor units,
slug validation, age formatting and English/Somali dictionary parity.

**`tests/tenant-isolation.test.ts`** — the ones that matter. They build two
complete schools and then, **as a genuinely authenticated user of school A**
(anon key + a real user JWT, exactly the app's production posture), attempt to:

- read B's children, and read B's child by its exact id;
- filter explicitly by B's `tenant_id`;
- read B's rows through twelve different tables;
- insert into B, update B's rows, delete B's rows;
- move themselves into B's tenant, or promote themselves to `super_admin`;
- change their own school's subscription status;
- as a parent, read a child they do not guard;
- as a teacher, create a class;
- as an anonymous visitor, read anything at all.

Every one must fail or come back empty. The suite also verifies that suspending
a tenant blocks writes while leaving reads and **all data** intact, and that
reactivation restores writes immediately.

These tests need real Supabase credentials, because the thing under test *is*
Postgres RLS — mocking it would prove nothing. Point `TEST_SUPABASE_*` at a
throwaway project, or let them fall back to your development variables. **With no
credentials configured they skip rather than fail**, so `npm test` works on a
fresh clone.

---

## Deploying to Vercel

1. Import the repository into Vercel.
2. Set the Node version to **22** in Project Settings → General.
3. Add every variable from [Environment variables](#environment-variables).
   `SUPABASE_SERVICE_ROLE_KEY` must be a *server* environment variable — never
   prefix it with `NEXT_PUBLIC_`.
4. Set `NEXT_PUBLIC_APP_URL` to your production URL.
5. Add your production URL to Supabase's redirect allow-list.

### Connection pooling

Serverless functions open a connection per invocation and will exhaust Postgres
under load. Use Supabase's **transaction pooler (pgbouncer, port 6543)** for
`DATABASE_URL`. Keep the direct/session connection (port 5432) for migrations
only. The Supabase JS client used throughout the app goes over PostgREST and is
not affected, but the setting matters the moment you add a direct SQL client or
an ORM.

---

## Project layout

```
supabase/migrations/     Reviewable SQL — you run these yourself
scripts/seed.ts          Two demo schools with realistic data
tests/                   Unit tests + cross-tenant RLS suite
src/
  app/
    [tenantSlug]/        The school workspace (dashboard, children, attendance…)
    apply/[tenantSlug]/  Public admission form — no account needed
    invite/[token]/      Invitation landing page
    auth/callback/       OAuth + magic-link landing; the email-match check
    platform/            Super-admin panel
    api/documents/       Gated, signed-URL document downloads
  components/
    app-shell/           Role-adaptive sidebar and mobile bottom bar
    safety/              Allergy badge, banner and summary
    attendance/          The mobile register
    ui/                  shadcn/ui-style primitives
  lib/
    auth/                Session, RBAC matrix, invitations, typed errors
    db/                  TenantScope (the central data-access layer), queries
    i18n/                Dictionaries and locale resolution
    notifications/       sendNotification, SMS-ready
    validation/          Zod schemas — the write contract
    audit.ts             Append-only audit trail
    rate-limit.ts        Fixed-window limiter for auth and public endpoints
```

---

## Environment variables

| Variable                                | Required | Notes                                                    |
| --------------------------------------- | -------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | yes      | Project URL                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | yes\*    | New-style `sb_publishable_…` key                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`         | yes\*    | Legacy anon JWT; used if the publishable key is absent    |
| `SUPABASE_SERVICE_ROLE_KEY`             | yes      | **Server only.** Bypasses RLS. Never expose to the client |
| `NEXT_PUBLIC_APP_URL`                   | yes      | Used to build invite links and OAuth redirects            |
| `NEXT_PUBLIC_APP_NAME`                  | no       | Defaults to `Smartubad`                                   |
| `SUPER_ADMIN_EMAILS`                    | yes      | Comma-separated platform administrators                   |
| `INVITE_TOKEN_TTL_HOURS`                | no       | Defaults to 72                                            |
| `NOTIFICATIONS_PROVIDER`                | no       | `console` (default) or `resend`                           |
| `RESEND_API_KEY`                        | if resend | —                                                        |
| `NOTIFICATIONS_FROM_EMAIL`              | if resend | e.g. `Smartubad <noreply@yourdomain.com>`                |
| `SMS_PROVIDER`                          | no       | `none` in v1                                              |
| `DATABASE_URL`                          | no       | Pooler string, for future direct SQL access               |
| `TEST_SUPABASE_*`                       | no       | Point the RLS suite at a throwaway project                |

\* One of the two is required; the publishable key is preferred.

---

## Deliberately not in v1

Planned, and intentionally out of scope for this release:

- Progress and development tracking (milestones across social, language, motor
  and cognitive domains, with periodic reports for parents)
- **Parent Corner content** — the section, navigation and categories are built;
  the parenting-education material is written and published later, bilingually
- **Automated payments** — v1 uses manual super-admin status control, and the
  data model is already shaped for a processor
- **SMS notifications** — email only; the code is SMS-ready
- Automated academic-year promotion (bulk-moving children into next year's classes)
- Staff self-attendance (teacher clock-in/out)
- Offline-tolerant attendance
- Two-way messaging, digital consent signatures, meal and menu planning

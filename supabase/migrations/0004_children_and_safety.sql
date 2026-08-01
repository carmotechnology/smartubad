-- ===========================================================================
-- 0004_children_and_safety.sql
-- children, enrollments, guardians, authorised_pickups, emergency_contacts,
-- child_allergies, child_medical_notes
--
-- Data minimisation: only what a kindergarten actually needs to operate.
-- Allergies are FIRST-CLASS STRUCTURED DATA, not a free-text note — the safety
-- UI (roster badges, detail banner, meal views) reads directly off this table.
-- ===========================================================================

create table if not exists public.children (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  first_name        text not null check (length(btrim(first_name)) between 1 and 60),
  last_name         text not null check (length(btrim(last_name)) between 1 and 60),
  preferred_name    text,
  date_of_birth     date not null,
  gender            text check (gender in ('male', 'female', 'other', 'undisclosed')),
  photo_path        text,                    -- Supabase Storage object path
  status            enrollment_status not null default 'active',
  notes             text,
  pickup_notes      text,                    -- editable by parents
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint children_dob_ck check (date_of_birth <= current_date)
);

create index if not exists children_tenant_idx on public.children (tenant_id);
create index if not exists children_tenant_status_idx on public.children (tenant_id, status);

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at before update on public.children
  for each row execute function app.set_updated_at();

-- Generated display name, handy for rosters and search.
create or replace function public.child_display_name(c public.children)
returns text language sql immutable as $$
  select coalesce(nullif(btrim(c.preferred_name), ''), c.first_name) || ' ' || c.last_name;
$$;

-- --- enrollments (child <-> class, per academic year) ----------------------
-- This is what makes rollover clean: a child row is permanent, the enrollment
-- is year-scoped. v1 rollover is manual (admin re-enrols); bulk promotion is
-- a later phase.
create table if not exists public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  class_id          uuid references public.classes(id) on delete set null,
  status            enrollment_status not null default 'active',
  enrolled_on       date not null default current_date,
  withdrawn_on      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint enrollments_child_year_uq unique (child_id, academic_year_id)
);

create index if not exists enrollments_tenant_year_idx
  on public.enrollments (tenant_id, academic_year_id);
create index if not exists enrollments_class_idx on public.enrollments (class_id);
create index if not exists enrollments_child_idx on public.enrollments (child_id);

drop trigger if exists enrollments_set_updated_at on public.enrollments;
create trigger enrollments_set_updated_at before update on public.enrollments
  for each row execute function app.set_updated_at();

-- --- guardians (parent profile <-> child) ----------------------------------
-- The single source of truth for "a parent may only ever see their own child".
create table if not exists public.guardians (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  relationship  text,                        -- mother / father / guardian ...
  is_primary    boolean not null default false,
  can_pickup    boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint guardians_uq unique (child_id, profile_id)
);

create index if not exists guardians_profile_idx on public.guardians (profile_id);
create index if not exists guardians_child_idx on public.guardians (child_id);
create index if not exists guardians_tenant_idx on public.guardians (tenant_id);

-- --- emergency contacts ----------------------------------------------------
create table if not exists public.emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  name          text not null,
  relationship  text,
  phone         text not null,
  email         citext,
  priority      smallint not null default 1 check (priority between 1 and 9),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists emergency_contacts_child_idx
  on public.emergency_contacts (child_id, priority);
create index if not exists emergency_contacts_tenant_idx on public.emergency_contacts (tenant_id);

drop trigger if exists emergency_contacts_set_updated_at on public.emergency_contacts;
create trigger emergency_contacts_set_updated_at before update on public.emergency_contacts
  for each row execute function app.set_updated_at();

-- --- authorised pickups ----------------------------------------------------
-- People allowed to collect the child who are not registered app users.
create table if not exists public.authorised_pickups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  name          text not null,
  relationship  text,
  phone         text,
  photo_path    text,
  id_reference  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists authorised_pickups_child_idx on public.authorised_pickups (child_id);
create index if not exists authorised_pickups_tenant_idx on public.authorised_pickups (tenant_id);

drop trigger if exists authorised_pickups_set_updated_at on public.authorised_pickups;
create trigger authorised_pickups_set_updated_at before update on public.authorised_pickups
  for each row execute function app.set_updated_at();

-- --- ALLERGIES (safety critical) -------------------------------------------
-- Structured: allergen + severity + reaction + required action.
-- e.g. ('Peanuts', 'severe', 'Anaphylaxis', 'Administer EpiPen from red bag,
--        call 999, then call parent')
create table if not exists public.child_allergies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  child_id         uuid not null references public.children(id) on delete cascade,
  allergen         text not null check (length(btrim(allergen)) between 1 and 120),
  severity         allergy_severity not null,
  reaction         text not null check (length(btrim(reaction)) between 1 and 400),
  required_action  text not null check (length(btrim(required_action)) between 1 and 600),
  medication       text,                     -- e.g. 'EpiPen Jr 0.15mg'
  medication_location text,                  -- e.g. 'red pouch in the child bag'
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint child_allergies_uq unique (child_id, allergen)
);

create index if not exists child_allergies_child_idx on public.child_allergies (child_id);
create index if not exists child_allergies_tenant_idx on public.child_allergies (tenant_id);
-- Fast "does this roster have any severe allergies?" lookups.
create index if not exists child_allergies_severity_idx
  on public.child_allergies (tenant_id, severity);

comment on table public.child_allergies is
  'Safety-critical. Surfaced as a badge on the class roster, a banner at the top of the child detail view, and on meal/menu views. Must be reachable in one tap.';

-- --- other medical info ----------------------------------------------------
create table if not exists public.child_medical_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  title         text not null,               -- 'Asthma', 'Febrile seizures'
  details       text,
  medication    text,
  action_plan   text,
  doctor_name   text,
  doctor_phone  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists child_medical_notes_child_idx on public.child_medical_notes (child_id);
create index if not exists child_medical_notes_tenant_idx on public.child_medical_notes (tenant_id);

drop trigger if exists child_medical_notes_set_updated_at on public.child_medical_notes;
create trigger child_medical_notes_set_updated_at before update on public.child_medical_notes
  for each row execute function app.set_updated_at();

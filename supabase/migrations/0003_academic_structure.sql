-- ===========================================================================
-- 0003_academic_structure.sql
-- academic_years, terms, classes, class_teachers
--
-- Academic year is foundational: enrollment, classes, attendance, reports,
-- events and finance all carry `academic_year_id` alongside `tenant_id`.
-- Exactly one year per tenant may be active at a time (enforced by a partial
-- unique index). Past years stay readable but are closed to writes at the
-- application layer.
-- ===========================================================================

create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 60),  -- '2025–2026'
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint academic_years_dates_ck check (end_date > start_date),
  constraint academic_years_tenant_name_uq unique (tenant_id, name)
);

-- "One academic year is active at a time" — per tenant.
create unique index if not exists academic_years_one_active_uidx
  on public.academic_years (tenant_id) where is_active;

create index if not exists academic_years_tenant_idx on public.academic_years (tenant_id);

drop trigger if exists academic_years_set_updated_at on public.academic_years;
create trigger academic_years_set_updated_at before update on public.academic_years
  for each row execute function app.set_updated_at();

-- --- terms (optional subdivision, used by finance) -------------------------
create table if not exists public.terms (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint terms_dates_ck check (end_date > start_date),
  constraint terms_year_name_uq unique (academic_year_id, name)
);

create index if not exists terms_tenant_year_idx on public.terms (tenant_id, academic_year_id);

drop trigger if exists terms_set_updated_at on public.terms;
create trigger terms_set_updated_at before update on public.terms
  for each row execute function app.set_updated_at();

-- --- classes / rooms -------------------------------------------------------
create table if not exists public.classes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  name              text not null check (length(btrim(name)) between 1 and 80),
  room              text,
  capacity          integer not null default 20 check (capacity between 1 and 200),
  age_range         text,
  colour            text check (colour is null or colour ~* '^#[0-9a-f]{6}$'),
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint classes_year_name_uq unique (academic_year_id, name)
);

create index if not exists classes_tenant_year_idx on public.classes (tenant_id, academic_year_id);

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at before update on public.classes
  for each row execute function app.set_updated_at();

-- --- class_teachers (a class may have several teachers) --------------------
create table if not exists public.class_teachers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  is_lead     boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint class_teachers_uq unique (class_id, profile_id)
);

create index if not exists class_teachers_profile_idx on public.class_teachers (profile_id);
create index if not exists class_teachers_tenant_idx on public.class_teachers (tenant_id);

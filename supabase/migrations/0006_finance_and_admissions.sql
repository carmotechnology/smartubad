-- ===========================================================================
-- 0006_finance_and_admissions.sql
-- fees, fee_payments, transactions, applications
--
-- Money is stored in MINOR UNITS (integer cents) — never floating point.
-- Currency comes from the tenant. No payment processor in v1: payments are
-- recorded by an admin. The shape (fee -> payments) is already what a
-- processor webhook would write into, so adding one later needs no rework.
-- ===========================================================================

-- --- fees charged to a child ----------------------------------------------
create table if not exists public.fees (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  term_id           uuid references public.terms(id) on delete set null,
  child_id          uuid not null references public.children(id) on delete cascade,
  description       text not null,             -- 'Term 1 tuition'
  amount_minor      bigint not null check (amount_minor >= 0),
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  due_date          date,
  status            fee_status not null default 'unpaid',
  -- Maintained by trigger from fee_payments; never written by hand.
  paid_minor        bigint not null default 0 check (paid_minor >= 0),
  notes             text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists fees_tenant_year_idx on public.fees (tenant_id, academic_year_id);
create index if not exists fees_child_idx on public.fees (child_id);
create index if not exists fees_status_idx on public.fees (tenant_id, status);

drop trigger if exists fees_set_updated_at on public.fees;
create trigger fees_set_updated_at before update on public.fees
  for each row execute function app.set_updated_at();

-- --- payments recorded against a fee ---------------------------------------
create table if not exists public.fee_payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  fee_id        uuid not null references public.fees(id) on delete cascade,
  amount_minor  bigint not null check (amount_minor > 0),
  paid_on       date not null default current_date,
  method        text not null default 'cash',   -- cash | mobile_money | bank | other
  reference     text,
  notes         text,
  recorded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists fee_payments_fee_idx on public.fee_payments (fee_id);
create index if not exists fee_payments_tenant_idx on public.fee_payments (tenant_id, paid_on desc);

-- Keep fees.paid_minor and fees.status derived from the payment rows.
create or replace function app.sync_fee_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_fee uuid := coalesce(new.fee_id, old.fee_id);
  total      bigint;
begin
  select coalesce(sum(amount_minor), 0) into total
    from public.fee_payments where fee_id = target_fee;

  update public.fees f
     set paid_minor = total,
         status = case
           when f.status = 'waived' then 'waived'::fee_status
           when total = 0 then 'unpaid'::fee_status
           when total >= f.amount_minor then 'paid'::fee_status
           else 'partial'::fee_status
         end
   where f.id = target_fee;

  return null;
end;
$$;

drop trigger if exists fee_payments_sync on public.fee_payments;
create trigger fee_payments_sync
  after insert or update or delete on public.fee_payments
  for each row execute function app.sync_fee_totals();

-- --- general ledger (income & expenses) ------------------------------------
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  kind              transaction_type not null,
  category          text not null default 'general',  -- salaries, rent, supplies, tuition...
  description       text,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on       date not null default current_date,
  fee_payment_id    uuid references public.fee_payments(id) on delete set null,
  recorded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists transactions_tenant_year_idx
  on public.transactions (tenant_id, academic_year_id, occurred_on desc);
create index if not exists transactions_kind_idx on public.transactions (tenant_id, kind);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function app.set_updated_at();

-- --- admissions / waitlist -------------------------------------------------
-- Submitted by prospective families through a public form. Deliberately NOT
-- linked to an auth user: applicants have no account yet.
create table if not exists public.applications (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,

  child_first_name  text not null,
  child_last_name   text not null,
  date_of_birth     date not null,
  gender            text check (gender in ('male', 'female', 'other', 'undisclosed')),

  parent_name       text not null,
  parent_email      citext not null,
  parent_phone      text not null,
  address           text,

  -- Allergy/medical info is collected UP FRONT, before the first day.
  -- [{ allergen, severity, reaction, required_action }]
  allergies         jsonb not null default '[]'::jsonb,
  medical_notes     text,
  preferred_start   date,
  message           text,

  status            application_status not null default 'pending',
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_notes      text,
  child_id          uuid references public.children(id) on delete set null,  -- set on approval

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint applications_allergies_ck check (jsonb_typeof(allergies) = 'array')
);

create index if not exists applications_tenant_status_idx
  on public.applications (tenant_id, status, created_at desc);
create index if not exists applications_year_idx on public.applications (academic_year_id);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
  for each row execute function app.set_updated_at();

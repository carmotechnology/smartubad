-- ===========================================================================
-- 0002_tenancy_and_identity.sql
-- tenants, profiles, invitations, audit_logs
--
-- Multi-tenancy model: ONE shared database, every tenant-owned table carries a
-- `tenant_id` column. Isolation is enforced by RLS (see 0008) *and* by the
-- application's central data-access layer. Both, always.
-- ===========================================================================

-- --- tenants ---------------------------------------------------------------
-- The tenant root. Not itself tenant-owned (it *is* the tenant).
create table if not exists public.tenants (
  id                  uuid primary key default gen_random_uuid(),

  -- Identity & branding (school admin editable)
  name                text        not null check (length(btrim(name)) between 2 and 120),
  slug                citext      not null unique
                      check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  logo_url            text,
  accent_color        text        check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$'),
  tagline             text        check (tagline is null or length(tagline) <= 160),

  -- Contact & location
  address             text,
  city                text,
  country             text,
  phone               text,
  contact_email       citext,
  website             text,

  -- Operational
  timezone            text        not null default 'Africa/Mogadishu',
  locale              text        not null default 'en' check (locale in ('en', 'so')),
  currency            text        not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  -- Subscription / access control. SUPER-ADMIN ONLY (see 7bis).
  -- No payment processor in v1; these columns are the payment-ready seam.
  plan                text        not null default 'standard',
  subscription_status subscription_status not null default 'trialing',
  trial_ends_at       timestamptz,
  status_note         text,                  -- why suspended, set by super-admin
  -- Reserved for a future payment processor. Unused in v1.
  billing_customer_id text,
  billing_ref         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists tenants_subscription_status_idx
  on public.tenants (subscription_status);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();

comment on column public.tenants.subscription_status is
  'Manually managed by the platform super-admin in v1. active/trialing => read-write; past_due/suspended => read-only (never delete data).';

-- --- profiles --------------------------------------------------------------
-- One row per authenticated user. `tenant_id` and `role` are assigned by the
-- invite that created the user — a user NEVER chooses their own tenant/role.
-- super_admin is the only role with tenant_id = NULL.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  tenant_id     uuid references public.tenants(id) on delete cascade,
  role          user_role not null,
  email         citext not null,
  full_name     text,
  avatar_url    text,
  phone         text,
  locale        text not null default 'en' check (locale in ('en', 'so')),
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The invariant that makes the whole model safe.
  constraint profiles_tenant_role_ck check (
    (role = 'super_admin' and tenant_id is null)
    or (role <> 'super_admin' and tenant_id is not null)
  )
);

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);
create index if not exists profiles_tenant_role_idx on public.profiles (tenant_id, role);
create unique index if not exists profiles_tenant_email_uidx
  on public.profiles (tenant_id, email) where tenant_id is not null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

-- --- invitations -----------------------------------------------------------
-- Email-bound, single-use, expiring. The raw token is NEVER stored — only a
-- SHA-256 hash, so a database leak cannot be replayed as a valid invite link.
create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references public.tenants(id) on delete cascade,
  email           citext not null,
  role            user_role not null check (role <> 'super_admin'),
  token_hash      text not null unique,       -- sha256(raw token), hex
  status          invitation_status not null default 'pending',
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles(id) on delete set null,
  revoked_at      timestamptz,
  invited_by      uuid references public.profiles(id) on delete set null,

  -- Role-specific payload applied on acceptance.
  class_ids       uuid[] not null default '{}',   -- teacher: classes to assign
  child_ids       uuid[] not null default '{}',   -- parent: children to link
  full_name       text,
  message         text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Owner/admin/teacher/parent invites always belong to a tenant.
  constraint invitations_tenant_ck check (tenant_id is not null)
);

create index if not exists invitations_tenant_idx on public.invitations (tenant_id);
create index if not exists invitations_email_idx on public.invitations (email);
create index if not exists invitations_status_idx on public.invitations (status, expires_at);
-- Only one live invite per (tenant, email).
create unique index if not exists invitations_pending_uidx
  on public.invitations (tenant_id, email) where status = 'pending';

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function app.set_updated_at();

comment on table public.invitations is
  'Invite tokens are single-use, expiring and bound to an email address. Acceptance requires the OAuth identity email to match `email` exactly (case-insensitive).';

-- --- audit_logs ------------------------------------------------------------
-- Append-only. Written by the service-role client; readable by tenant admins.
create table if not exists public.audit_logs (
  id           bigserial primary key,
  tenant_id    uuid references public.tenants(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_email  citext,
  action       text not null,               -- e.g. 'child.update', 'invite.accept'
  entity_type  text,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

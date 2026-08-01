-- ===========================================================================
-- 0007_rls_helpers.sql
-- Helper functions used by every RLS policy.
--
-- All helpers are STABLE + SECURITY DEFINER and live in the `app` schema.
-- SECURITY DEFINER matters: they read public.profiles, and if they ran as the
-- caller the profiles policies would recurse into themselves. Because they run
-- as the owner they bypass RLS on that lookup, which is exactly what we want
-- and why `search_path` is pinned on every one of them.
-- ===========================================================================

-- Which JWT role is making the request: 'anon' | 'authenticated' | 'service_role'.
create or replace function app.jwt_role()
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_setting('role', true)
  );
$$;

-- The caller's tenant. NULL for super-admins and unauthenticated requests.
create or replace function app.current_tenant_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.tenant_id from public.profiles p
   where p.id = auth.uid() and p.is_active
   limit 1;
$$;

create or replace function app.current_user_role()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.role::text from public.profiles p
   where p.id = auth.uid() and p.is_active
   limit 1;
$$;

create or replace function app.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_user_role() = 'super_admin', false);
$$;

-- owner | admin
create or replace function app.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_user_role() in ('owner', 'admin'), false);
$$;

-- owner | admin | teacher
create or replace function app.is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_user_role() in ('owner', 'admin', 'teacher'), false);
$$;

create or replace function app.is_parent()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_user_role() = 'parent', false);
$$;

-- THE isolation predicate. Every tenant-owned policy starts with this.
create or replace function app.belongs_to(tid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select tid is not null and tid = app.current_tenant_id();
$$;

-- Section 7bis: soft read-only enforcement. Writes require an active tenant.
-- past_due / suspended tenants keep full READ access and lose WRITE access.
-- Nothing is ever deleted for non-payment.
create or replace function app.tenant_writable(tid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app.belongs_to(tid)
     and exists (
       select 1 from public.tenants t
        where t.id = tid
          and t.subscription_status in ('active', 'trialing')
     );
$$;

-- Classes the caller teaches.
create or replace function app.teacher_class_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select ct.class_id from public.class_teachers ct where ct.profile_id = auth.uid();
$$;

create or replace function app.teaches_class(cid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select cid is not null
     and exists (
       select 1 from public.class_teachers ct
        where ct.class_id = cid and ct.profile_id = auth.uid()
     );
$$;

-- Children the caller may READ.
--   owner/admin  -> every child in their tenant
--   teacher      -> children enrolled in a class they teach (any year)
--   parent       -> only children they are a registered guardian of
--   super_admin  -> none. Aggregate stats only (see app.platform_stats).
create or replace function app.accessible_child_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.id
    from public.children c
   where c.tenant_id = app.current_tenant_id()
     and app.is_admin()
  union
  select e.child_id
    from public.enrollments e
    join public.class_teachers ct on ct.class_id = e.class_id
   where ct.profile_id = auth.uid()
     and e.tenant_id = app.current_tenant_id()
  union
  select g.child_id
    from public.guardians g
   where g.profile_id = auth.uid()
     and g.tenant_id = app.current_tenant_id();
$$;

create or replace function app.can_read_child(cid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select cid is not null and exists (
    select 1 from app.accessible_child_ids() a where a = cid
  );
$$;

-- Staff-only write access to a child's records, gated on subscription status.
create or replace function app.can_write_child(cid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app.is_staff()
     and app.can_read_child(cid)
     and app.tenant_writable(app.current_tenant_id());
$$;

-- --- Super-admin aggregate stats -------------------------------------------
-- The super-admin panel shows counts, never tenant content. This function is
-- the ONLY route from a super-admin session to tenant-derived numbers, and it
-- returns nothing but aggregates.
create or replace function app.platform_stats()
returns table (
  tenant_id           uuid,
  tenant_name         text,
  slug                text,
  subscription_status subscription_status,
  children_count      bigint,
  staff_count         bigint,
  parent_count        bigint,
  class_count         bigint,
  active_year         text,
  created_at          timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    t.slug::text,
    t.subscription_status,
    (select count(*) from public.children c
      where c.tenant_id = t.id and c.status = 'active'),
    (select count(*) from public.profiles p
      where p.tenant_id = t.id and p.role in ('owner', 'admin', 'teacher')),
    (select count(*) from public.profiles p
      where p.tenant_id = t.id and p.role = 'parent'),
    (select count(*) from public.classes cl
      where cl.tenant_id = t.id and not cl.is_archived),
    (select ay.name from public.academic_years ay
      where ay.tenant_id = t.id and ay.is_active limit 1),
    t.created_at
  from public.tenants t
  where app.is_super_admin()      -- hard gate: nobody else gets a single row
  order by t.created_at desc;
$$;

-- --- Privilege escalation guard --------------------------------------------
-- A user may edit their own profile (name, avatar, locale, phone) but MUST NOT
-- be able to move themselves to another tenant or promote themselves. Only the
-- service-role client (invite acceptance, super-admin actions) may do that.
create or replace function app.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.jwt_role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role may only be changed by the platform (role escalation blocked)'
      using errcode = '42501';
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'profiles.tenant_id is immutable (tenant hopping blocked)'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges before update on public.profiles
  for each row execute function app.guard_profile_privileges();

-- Same idea for tenants: plan / subscription_status / slug are super-admin only.
create or replace function app.guard_tenant_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.jwt_role() = 'service_role' or app.is_super_admin() then
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.plan is distinct from old.plan
     or new.slug is distinct from old.slug
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'slug, plan and subscription status are managed by the platform super-admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tenants_guard_privileges on public.tenants;
create trigger tenants_guard_privileges before update on public.tenants
  for each row execute function app.guard_tenant_privileges();

-- --- Grants ----------------------------------------------------------------
grant execute on function
  app.jwt_role(), app.current_tenant_id(), app.current_user_role(),
  app.is_super_admin(), app.is_admin(), app.is_staff(), app.is_parent(),
  app.belongs_to(uuid), app.tenant_writable(uuid),
  app.teacher_class_ids(), app.teaches_class(uuid),
  app.accessible_child_ids(), app.can_read_child(uuid), app.can_write_child(uuid),
  app.platform_stats()
to authenticated, service_role;

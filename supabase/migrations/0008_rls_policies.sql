-- ===========================================================================
-- 0008_rls_policies.sql
-- Policies, part 1/3: baseline grants, tenants, profiles, invitations,
-- audit_logs. Part 2 is 0009 (academic + children), part 3 is 0010
-- (daily operations, finance, admissions) which also runs the coverage check.
--
-- NON-NEGOTIABLE RULE: every tenant-owned table has BOTH a `tenant_id` column
-- AND an RLS policy. The DO block at the end of 0010 verifies that and raises
-- if the rule was ever broken.
--
-- Reading model:
--   super_admin -> tenants table + aggregate stats only. No tenant content.
--   owner/admin -> everything inside their own tenant.
--   teacher     -> children in classes they teach.
--   parent      -> their own children only.
-- Writing model: reads above AND app.tenant_writable(tenant_id), which is
-- false for past_due / suspended tenants (soft read-only, section 7bis).
-- ===========================================================================

-- --- Baseline privileges ---------------------------------------------------
-- RLS decides row visibility; these grants decide who may even attempt it.
-- `anon` gets nothing: every public entry point goes through a server action
-- using the service-role client after validation and rate limiting.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;

-- ===========================================================================
-- tenants
-- ===========================================================================
alter table public.tenants enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (app.is_super_admin() or app.belongs_to(id));

-- Tenant creation is a super-admin action; the app performs it with the
-- service-role client, which bypasses RLS. This policy is the belt to that
-- suspenders and keeps the panel working if it ever switches to a user client.
drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (app.is_super_admin());

-- School admins edit branding / contact / operational settings.
-- slug, plan, subscription_status and trial_ends_at are blocked by the
-- app.guard_tenant_privileges() trigger, not by this policy.
drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated
  using (app.is_super_admin() or (app.is_admin() and app.belongs_to(id)))
  with check (app.is_super_admin() or (app.is_admin() and app.belongs_to(id)));

-- No delete policy: tenants are suspended, never deleted. Data is never
-- destroyed for non-payment.

-- ===========================================================================
-- profiles
-- ===========================================================================
alter table public.profiles enable row level security;

-- Own row always. Staff see everyone in their tenant. Parents see only staff
-- profiles (they must never enumerate other families).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      app.belongs_to(tenant_id)
      and (
        app.is_staff()
        or (app.is_parent() and role in ('owner', 'admin', 'teacher'))
      )
    )
  );

-- No insert policy for `authenticated`. Profiles are created exclusively by
-- the invite-acceptance path using the service-role client, which is what
-- guarantees tenant_id and role come from the invite and never from the user.

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or (app.is_admin() and app.belongs_to(tenant_id) and app.tenant_writable(tenant_id))
  )
  with check (
    id = auth.uid()
    or (app.is_admin() and app.belongs_to(tenant_id) and app.tenant_writable(tenant_id))
  );

-- No delete policy: staff are deactivated (is_active = false), not deleted,
-- so their historical attendance/report authorship stays intact.

-- ===========================================================================
-- invitations
-- ===========================================================================
alter table public.invitations enable row level security;

-- Admins see every invite in their school; teachers see only the parent
-- invites they themselves sent.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and (app.is_admin() or invited_by = auth.uid())
  );

-- Creation and acceptance run through the service-role client: the raw token
-- is generated server-side, only its SHA-256 hash is stored, and acceptance
-- must verify the OAuth email matches. None of that can be delegated to a
-- user-scoped client safely.

-- Revoking an invite is safe to expose to admins.
drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations
  for update to authenticated
  using (app.is_admin() and app.belongs_to(tenant_id))
  with check (app.is_admin() and app.belongs_to(tenant_id));

-- ===========================================================================
-- audit_logs  (append-only; written by the service-role client)
-- ===========================================================================
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (app.is_admin() and app.belongs_to(tenant_id));

-- Deliberately no insert/update/delete policy for `authenticated`: an audit
-- trail a user can write to or erase is not an audit trail.

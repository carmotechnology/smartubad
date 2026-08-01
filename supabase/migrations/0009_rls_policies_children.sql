-- ===========================================================================
-- 0009_rls_policies_children.sql
-- Policies, part 2/3: academic structure + children and safety data.
-- ===========================================================================

-- ===========================================================================
-- academic_years / terms / classes / class_teachers
-- Readable by the whole tenant (parents need class and year names).
-- Writable by owner/admin only, and only while the tenant is active.
-- ===========================================================================

alter table public.academic_years enable row level security;

drop policy if exists academic_years_select on public.academic_years;
create policy academic_years_select on public.academic_years
  for select to authenticated using (app.belongs_to(tenant_id));

drop policy if exists academic_years_write on public.academic_years;
create policy academic_years_write on public.academic_years
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.terms enable row level security;

drop policy if exists terms_select on public.terms;
create policy terms_select on public.terms
  for select to authenticated using (app.belongs_to(tenant_id));

drop policy if exists terms_write on public.terms;
create policy terms_write on public.terms
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.classes enable row level security;

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
  for select to authenticated using (app.belongs_to(tenant_id));

drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.class_teachers enable row level security;

drop policy if exists class_teachers_select on public.class_teachers;
create policy class_teachers_select on public.class_teachers
  for select to authenticated using (app.belongs_to(tenant_id));

drop policy if exists class_teachers_write on public.class_teachers;
create policy class_teachers_write on public.class_teachers
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- children
-- Visibility is decided by app.can_read_child(): admins see the whole school,
-- teachers see the children in classes they teach, parents see only their own.
-- ===========================================================================
alter table public.children enable row level security;

drop policy if exists children_select on public.children;
create policy children_select on public.children
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(id));

drop policy if exists children_insert on public.children;
create policy children_insert on public.children
  for insert to authenticated
  with check (app.is_admin() and app.tenant_writable(tenant_id));

drop policy if exists children_update on public.children;
create policy children_update on public.children
  for update to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- No delete policy. Children are withdrawn (status = 'withdrawn'), never
-- deleted — attendance, incident and finance history must survive.
--
-- Parents updating pickup notes do NOT go through this policy: that runs as a
-- server action which verifies guardianship and writes only `pickup_notes`.
-- RLS cannot restrict a policy to a single column, so the narrower rule is
-- enforced where it can be: server-side.

-- ===========================================================================
-- enrollments
-- ===========================================================================
alter table public.enrollments enable row level security;

drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists enrollments_write on public.enrollments;
create policy enrollments_write on public.enrollments
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- guardians  (the parent <-> child link that powers parent isolation)
-- ===========================================================================
alter table public.guardians enable row level security;

drop policy if exists guardians_select on public.guardians;
create policy guardians_select on public.guardians
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (app.belongs_to(tenant_id) and app.is_staff() and app.can_read_child(child_id))
  );

drop policy if exists guardians_write on public.guardians;
create policy guardians_write on public.guardians
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- emergency_contacts / authorised_pickups
-- Anyone who may read the child may read these — a teacher needs the
-- emergency number and the approved pickup list at the door.
-- ===========================================================================
alter table public.emergency_contacts enable row level security;

drop policy if exists emergency_contacts_select on public.emergency_contacts;
create policy emergency_contacts_select on public.emergency_contacts
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists emergency_contacts_write on public.emergency_contacts;
create policy emergency_contacts_write on public.emergency_contacts
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.authorised_pickups enable row level security;

drop policy if exists authorised_pickups_select on public.authorised_pickups;
create policy authorised_pickups_select on public.authorised_pickups
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists authorised_pickups_write on public.authorised_pickups;
create policy authorised_pickups_write on public.authorised_pickups
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- child_allergies  (SAFETY CRITICAL)
-- Read access is deliberately as wide as child access: a teacher must never
-- be unable to see why a child cannot eat something. Write access is
-- admin-only so allergy records cannot be casually altered.
-- ===========================================================================
alter table public.child_allergies enable row level security;

drop policy if exists child_allergies_select on public.child_allergies;
create policy child_allergies_select on public.child_allergies
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists child_allergies_write on public.child_allergies;
create policy child_allergies_write on public.child_allergies
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- child_medical_notes
-- ===========================================================================
alter table public.child_medical_notes enable row level security;

drop policy if exists child_medical_notes_select on public.child_medical_notes;
create policy child_medical_notes_select on public.child_medical_notes
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists child_medical_notes_write on public.child_medical_notes;
create policy child_medical_notes_write on public.child_medical_notes
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

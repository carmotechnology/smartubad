-- ===========================================================================
-- 0010_rls_policies_operations.sql
-- Policies, part 3/3: daily operations, communication, finance, admissions,
-- plus the coverage check that enforces the tenant_id + RLS rule.
-- ===========================================================================

-- ===========================================================================
-- attendance_records
-- app.can_write_child() = is_staff AND can_read_child AND tenant_writable.
-- ===========================================================================
alter table public.attendance_records enable row level security;

drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists attendance_insert on public.attendance_records;
create policy attendance_insert on public.attendance_records
  for insert to authenticated
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists attendance_update on public.attendance_records;
create policy attendance_update on public.attendance_records
  for update to authenticated
  using (app.belongs_to(tenant_id) and app.can_write_child(child_id))
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists attendance_delete on public.attendance_records;
create policy attendance_delete on public.attendance_records
  for delete to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- daily_reports
-- Parents see a report only once it is published; staff see drafts too.
-- ===========================================================================
alter table public.daily_reports enable row level security;

drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and app.can_read_child(child_id)
    and (app.is_staff() or is_published)
  );

drop policy if exists daily_reports_insert on public.daily_reports;
create policy daily_reports_insert on public.daily_reports
  for insert to authenticated
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists daily_reports_update on public.daily_reports;
create policy daily_reports_update on public.daily_reports
  for update to authenticated
  using (app.belongs_to(tenant_id) and app.can_write_child(child_id))
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists daily_reports_delete on public.daily_reports;
create policy daily_reports_delete on public.daily_reports
  for delete to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- report_media  (photos of children — gated exactly like the child record)
-- ===========================================================================
alter table public.report_media enable row level security;

drop policy if exists report_media_select on public.report_media;
create policy report_media_select on public.report_media
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists report_media_write on public.report_media;
create policy report_media_write on public.report_media
  for all to authenticated
  using (app.belongs_to(tenant_id) and app.can_write_child(child_id))
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

-- ===========================================================================
-- announcements
-- school  -> everyone in the tenant
-- class   -> staff, plus parents of a child enrolled in that class
-- staff   -> staff only
-- ===========================================================================
alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and (
      app.is_staff()
      or audience = 'school'
      or (
        audience = 'class'
        and exists (
          select 1 from public.enrollments e
           where e.class_id = announcements.class_id
             and e.child_id in (select app.accessible_child_ids())
        )
      )
    )
  );

-- Admins post anywhere; teachers post only to a class they actually teach.
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (
    app.tenant_writable(tenant_id)
    and (
      app.is_admin()
      or (app.current_user_role() = 'teacher'
          and audience = 'class'
          and app.teaches_class(class_id))
    )
  );

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update to authenticated
  using (
    app.tenant_writable(tenant_id)
    and (app.is_admin() or created_by = auth.uid())
  )
  with check (
    app.tenant_writable(tenant_id)
    and (app.is_admin() or created_by = auth.uid())
  );

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated
  using (app.tenant_writable(tenant_id) and (app.is_admin() or created_by = auth.uid()));

-- ===========================================================================
-- calendar_events
-- ===========================================================================
alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and (
      app.is_staff()
      or (
        visible_to_parents
        and (
          class_id is null
          or exists (
            select 1 from public.enrollments e
             where e.class_id = calendar_events.class_id
               and e.child_id in (select app.accessible_child_ids())
          )
        )
      )
    )
  );

drop policy if exists calendar_events_write on public.calendar_events;
create policy calendar_events_write on public.calendar_events
  for all to authenticated
  using (
    app.tenant_writable(tenant_id)
    and (app.is_admin() or (app.current_user_role() = 'teacher' and app.teaches_class(class_id)))
  )
  with check (
    app.tenant_writable(tenant_id)
    and (app.is_admin() or (app.current_user_role() = 'teacher' and app.teaches_class(class_id)))
  );

-- ===========================================================================
-- child_documents
-- Staff (with child access) see all of a child's documents; guardians see
-- only those explicitly marked parent_visible.
-- ===========================================================================
alter table public.child_documents enable row level security;

drop policy if exists child_documents_select on public.child_documents;
create policy child_documents_select on public.child_documents
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and app.can_read_child(child_id)
    and (app.is_staff() or parent_visible)
  );

drop policy if exists child_documents_write on public.child_documents;
create policy child_documents_write on public.child_documents
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- incidents  (injury / illness / medication given)
-- Parents can read their own child's incidents — that transparency is the
-- point of the log.
-- ===========================================================================
alter table public.incidents enable row level security;

drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents
  for select to authenticated
  using (app.belongs_to(tenant_id) and app.can_read_child(child_id));

drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents
  for insert to authenticated
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists incidents_update on public.incidents;
create policy incidents_update on public.incidents
  for update to authenticated
  using (app.belongs_to(tenant_id) and app.can_write_child(child_id))
  with check (app.belongs_to(tenant_id) and app.can_write_child(child_id));

drop policy if exists incidents_delete on public.incidents;
create policy incidents_delete on public.incidents
  for delete to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- fees / fee_payments / transactions
-- Admins manage the books. Parents see their own child's fees and payments
-- and nothing else — never the school ledger.
-- ===========================================================================
alter table public.fees enable row level security;

drop policy if exists fees_select on public.fees;
create policy fees_select on public.fees
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and (app.is_admin() or (app.is_parent() and app.can_read_child(child_id)))
  );

drop policy if exists fees_write on public.fees;
create policy fees_write on public.fees
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.fee_payments enable row level security;

drop policy if exists fee_payments_select on public.fee_payments;
create policy fee_payments_select on public.fee_payments
  for select to authenticated
  using (
    app.belongs_to(tenant_id)
    and (
      app.is_admin()
      or (
        app.is_parent()
        and exists (
          select 1 from public.fees f
           where f.id = fee_payments.fee_id
             and app.can_read_child(f.child_id)
        )
      )
    )
  );

drop policy if exists fee_payments_write on public.fee_payments;
create policy fee_payments_write on public.fee_payments
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

alter table public.transactions enable row level security;

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (app.is_admin() and app.belongs_to(tenant_id));

drop policy if exists transactions_write on public.transactions;
create policy transactions_write on public.transactions
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- applications  (admissions intake)
-- Public submission does NOT get an `anon` insert policy: the intake form
-- posts to a server action that validates with Zod, rate-limits by IP and
-- then writes with the service-role client. An open anon insert policy would
-- be a spam endpoint into every tenant's database.
-- ===========================================================================
alter table public.applications enable row level security;

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (app.is_admin() and app.belongs_to(tenant_id));

drop policy if exists applications_write on public.applications;
create policy applications_write on public.applications
  for all to authenticated
  using (app.is_admin() and app.tenant_writable(tenant_id))
  with check (app.is_admin() and app.tenant_writable(tenant_id));

-- ===========================================================================
-- COVERAGE CHECK
-- Fails the migration if any table in `public` is missing RLS, is missing a
-- `tenant_id` column, or has RLS enabled but zero policies (which silently
-- denies everything and is just as much a bug).
-- `tenants` is exempt from the tenant_id rule: it *is* the tenant.
-- ===========================================================================
do $$
declare
  offenders text;
begin
  select string_agg(format('%s (%s)', t.relname, reason), ', ' order by t.relname)
    into offenders
  from (
    select c.oid, c.relname, c.relrowsecurity,
      case
        when not c.relrowsecurity then 'RLS not enabled'
        when c.relname <> 'tenants' and not exists (
          select 1 from information_schema.columns col
           where col.table_schema = 'public'
             and col.table_name = c.relname
             and col.column_name = 'tenant_id'
        ) then 'no tenant_id column'
        when not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        ) then 'RLS enabled but no policies'
      end as reason
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
  ) t
  where t.reason is not null;

  if offenders is not null then
    raise exception 'Tenant-isolation rule violated -> %', offenders;
  end if;

  raise notice 'RLS coverage check passed: every public table has tenant_id + RLS + policies.';
end $$;

-- ===========================================================================
-- 0005_daily_operations.sql
-- attendance_records, daily_reports, report_media, announcements,
-- calendar_events, child_documents, incidents
-- ===========================================================================

-- --- attendance ------------------------------------------------------------
-- One row per child per day. The most-used screen in the product.
create table if not exists public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  class_id          uuid references public.classes(id) on delete set null,
  attendance_date   date not null default current_date,
  status            attendance_status not null,
  check_in_at       timestamptz,
  check_out_at      timestamptz,
  dropped_off_by    text,
  picked_up_by      text,
  notes             text,
  recorded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint attendance_child_date_uq unique (child_id, attendance_date),
  constraint attendance_times_ck check (
    check_out_at is null or check_in_at is null or check_out_at >= check_in_at
  )
);

create index if not exists attendance_tenant_date_idx
  on public.attendance_records (tenant_id, attendance_date desc);
create index if not exists attendance_class_date_idx
  on public.attendance_records (class_id, attendance_date desc);
create index if not exists attendance_child_date_idx
  on public.attendance_records (child_id, attendance_date desc);
create index if not exists attendance_year_idx
  on public.attendance_records (academic_year_id);

drop trigger if exists attendance_set_updated_at on public.attendance_records;
create trigger attendance_set_updated_at before update on public.attendance_records
  for each row execute function app.set_updated_at();

-- --- daily reports ---------------------------------------------------------
create table if not exists public.daily_reports (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  class_id          uuid references public.classes(id) on delete set null,
  report_date       date not null default current_date,
  mood              child_mood,
  -- [{ "type": "lunch", "amount": "most", "note": "..." }]
  meals             jsonb not null default '[]'::jsonb,
  -- [{ "from": "12:30", "to": "13:45" }]
  naps              jsonb not null default '[]'::jsonb,
  activities        text,
  notes             text,
  toileting         text,
  is_published      boolean not null default false,
  published_at      timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint daily_reports_child_date_uq unique (child_id, report_date),
  constraint daily_reports_meals_ck check (jsonb_typeof(meals) = 'array'),
  constraint daily_reports_naps_ck check (jsonb_typeof(naps) = 'array')
);

create index if not exists daily_reports_tenant_date_idx
  on public.daily_reports (tenant_id, report_date desc);
create index if not exists daily_reports_child_date_idx
  on public.daily_reports (child_id, report_date desc);
create index if not exists daily_reports_class_date_idx
  on public.daily_reports (class_id, report_date desc);

drop trigger if exists daily_reports_set_updated_at on public.daily_reports;
create trigger daily_reports_set_updated_at before update on public.daily_reports
  for each row execute function app.set_updated_at();

-- --- report media (photos) -------------------------------------------------
create table if not exists public.report_media (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  daily_report_id   uuid references public.daily_reports(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  storage_path      text not null,
  caption           text,
  mime_type         text,
  size_bytes        bigint,
  uploaded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists report_media_child_idx on public.report_media (child_id, created_at desc);
create index if not exists report_media_report_idx on public.report_media (daily_report_id);
create index if not exists report_media_tenant_idx on public.report_media (tenant_id);

-- --- announcements (one-way in v1) -----------------------------------------
create table if not exists public.announcements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  audience          announcement_audience not null default 'school',
  class_id          uuid references public.classes(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 2 and 160),
  body              text not null,
  is_pinned         boolean not null default false,
  published_at      timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A class announcement must name a class; a school one must not.
  constraint announcements_audience_ck check (
    (audience = 'class' and class_id is not null)
    or (audience <> 'class' and class_id is null)
  )
);

create index if not exists announcements_tenant_published_idx
  on public.announcements (tenant_id, published_at desc);
create index if not exists announcements_class_idx on public.announcements (class_id);

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function app.set_updated_at();

-- --- calendar events -------------------------------------------------------
create table if not exists public.calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  academic_year_id   uuid not null references public.academic_years(id) on delete cascade,
  class_id           uuid references public.classes(id) on delete cascade,
  title              text not null,
  description        text,
  event_type         event_type not null default 'activity',
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  all_day            boolean not null default false,
  location           text,
  visible_to_parents boolean not null default true,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint calendar_events_range_ck check (ends_at is null or ends_at >= starts_at)
);

create index if not exists calendar_events_tenant_start_idx
  on public.calendar_events (tenant_id, starts_at);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at before update on public.calendar_events
  for each row execute function app.set_updated_at();

-- --- per-child documents ---------------------------------------------------
create table if not exists public.child_documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  child_id       uuid not null references public.children(id) on delete cascade,
  title          text not null,
  category       document_category not null default 'other',
  storage_path   text not null,
  mime_type      text,
  size_bytes     bigint,
  -- false => staff only (default). true => the child's guardians may read it.
  parent_visible boolean not null default false,
  uploaded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists child_documents_child_idx on public.child_documents (child_id);
create index if not exists child_documents_tenant_idx on public.child_documents (tenant_id);

drop trigger if exists child_documents_set_updated_at on public.child_documents;
create trigger child_documents_set_updated_at before update on public.child_documents
  for each row execute function app.set_updated_at();

-- --- health & incident log -------------------------------------------------
create table if not exists public.incidents (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  academic_year_id   uuid not null references public.academic_years(id) on delete cascade,
  child_id           uuid not null references public.children(id) on delete cascade,
  class_id           uuid references public.classes(id) on delete set null,
  incident_type      incident_type not null,
  occurred_at        timestamptz not null default now(),
  location           text,
  description        text not null,
  action_taken       text not null,
  medication_name    text,
  medication_dose    text,
  administered_by    uuid references public.profiles(id) on delete set null,
  witness            text,
  parent_notified_at timestamptz,
  notified_by        uuid references public.profiles(id) on delete set null,
  reported_by        uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists incidents_tenant_occurred_idx
  on public.incidents (tenant_id, occurred_at desc);
create index if not exists incidents_child_idx on public.incidents (child_id, occurred_at desc);

drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at before update on public.incidents
  for each row execute function app.set_updated_at();

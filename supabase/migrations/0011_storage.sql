-- ===========================================================================
-- 0011_storage.sql
-- Supabase Storage buckets + object-level policies.
--
-- Path convention — the first folder segment is ALWAYS the tenant id, so the
-- same isolation rule that guards the tables also guards the files:
--   tenant-logos     {tenant_id}/logo.png
--   child-photos     {tenant_id}/{child_id}/avatar.jpg
--   child-documents  {tenant_id}/{child_id}/{uuid}.pdf
--   report-media     {tenant_id}/{child_id}/{uuid}.jpg
-- ===========================================================================

-- --- Buckets ---------------------------------------------------------------
-- Only logos are public: they appear on the parent-facing sign-in and
-- admission pages before anyone is authenticated. Everything involving a
-- child is private and served through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tenant-logos', 'tenant-logos', true, 2097152,
   array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('child-photos', 'child-photos', false, 5242880,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('child-documents', 'child-documents', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('report-media', 'report-media', false, 10485760,
   array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --- Path helper -----------------------------------------------------------
-- Safely reads the nth folder segment of an object path as a uuid, returning
-- NULL for anything malformed rather than raising.
create or replace function app.path_uuid(object_path text, idx int)
returns uuid
language plpgsql
immutable
set search_path = storage, public, pg_temp
as $$
declare
  seg text;
begin
  seg := (storage.foldername(object_path))[idx];
  if seg is null or seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return seg::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function app.path_uuid(text, int) to authenticated, service_role;

-- ===========================================================================
-- tenant-logos
-- Public read (anyone, including anon). Written by admins of that tenant.
-- ===========================================================================
drop policy if exists tenant_logos_read on storage.objects;
create policy tenant_logos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'tenant-logos');

drop policy if exists tenant_logos_write on storage.objects;
create policy tenant_logos_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'tenant-logos'
    and app.is_admin()
    and app.tenant_writable(app.path_uuid(name, 1))
  )
  with check (
    bucket_id = 'tenant-logos'
    and app.is_admin()
    and app.tenant_writable(app.path_uuid(name, 1))
  );

-- ===========================================================================
-- child-photos  — readable by anyone who may read the child
-- ===========================================================================
drop policy if exists child_photos_read on storage.objects;
create policy child_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'child-photos'
    and app.belongs_to(app.path_uuid(name, 1))
    and app.can_read_child(app.path_uuid(name, 2))
  );

drop policy if exists child_photos_write on storage.objects;
create policy child_photos_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'child-photos'
    and app.can_write_child(app.path_uuid(name, 2))
  )
  with check (
    bucket_id = 'child-photos'
    and app.can_write_child(app.path_uuid(name, 2))
  );

-- ===========================================================================
-- child-documents — staff only. Guardian access to parent_visible documents
-- is granted by the server issuing a short-lived signed URL after checking
-- the child_documents row, so no parent policy is needed (or wanted) here.
-- ===========================================================================
drop policy if exists child_documents_read on storage.objects;
create policy child_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'child-documents'
    and app.is_staff()
    and app.belongs_to(app.path_uuid(name, 1))
    and app.can_read_child(app.path_uuid(name, 2))
  );

drop policy if exists child_documents_write on storage.objects;
create policy child_documents_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'child-documents'
    and app.is_admin()
    and app.tenant_writable(app.path_uuid(name, 1))
  )
  with check (
    bucket_id = 'child-documents'
    and app.is_admin()
    and app.tenant_writable(app.path_uuid(name, 1))
  );

-- ===========================================================================
-- report-media — daily-report photos, same gate as the child record
-- ===========================================================================
drop policy if exists report_media_read on storage.objects;
create policy report_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-media'
    and app.belongs_to(app.path_uuid(name, 1))
    and app.can_read_child(app.path_uuid(name, 2))
  );

drop policy if exists report_media_write on storage.objects;
create policy report_media_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'report-media'
    and app.can_write_child(app.path_uuid(name, 2))
  )
  with check (
    bucket_id = 'report-media'
    and app.can_write_child(app.path_uuid(name, 2))
  );

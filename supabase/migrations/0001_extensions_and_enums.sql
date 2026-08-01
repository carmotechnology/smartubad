-- ===========================================================================
-- 0001_extensions_and_enums.sql
-- Extensions, the private `app` schema for RLS helpers, and all enum types.
--
-- RUN MANUALLY. Nothing in this repo applies migrations automatically.
-- Order matters: run 0001 -> 0009 in sequence.
-- ===========================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid(), digest()
create extension if not exists "citext";        -- case-insensitive email columns

-- All RLS helper functions live in `app` so they are namespaced away from
-- application tables. The schema is NOT exposed via PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- --- Enums -----------------------------------------------------------------

do $$ begin
  create type user_role as enum ('super_admin', 'owner', 'admin', 'teacher', 'parent');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Manual, super-admin controlled in v1. Kept payment-processor ready.
  create type subscription_status as enum ('trialing', 'active', 'past_due', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum ('active', 'waitlist', 'withdrawn', 'graduated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'absent', 'late', 'excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type allergy_severity as enum ('mild', 'moderate', 'severe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fee_status as enum ('unpaid', 'partial', 'paid', 'waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum ('pending', 'waitlisted', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_type as enum ('injury', 'illness', 'medication', 'behaviour', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type announcement_audience as enum ('school', 'class', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_category as enum (
    'birth_certificate', 'immunisation', 'enrollment_form', 'medical', 'consent', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum ('holiday', 'meeting', 'activity', 'closure', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type child_mood as enum ('happy', 'calm', 'tired', 'upset', 'unwell');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- --- Shared trigger --------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

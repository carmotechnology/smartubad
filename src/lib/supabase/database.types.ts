/**
 * Database types.
 *
 * Hand-written to mirror `supabase/migrations/*.sql`. Once the owner has run
 * the migrations against their project, `npm run db:types` regenerates this
 * file from the live schema (requires the Supabase CLI and a linked project)
 * and will replace it wholesale.
 *
 * `Insert` and `Update` are modelled as partials on purpose: Zod schemas in
 * `src/lib/validation` are the real write contract, and the database's own
 * NOT NULL / CHECK constraints are the last word. Duplicating required-column
 * lists here would be a third source of truth that silently drifts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = "super_admin" | "owner" | "admin" | "teacher" | "parent";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended";
export type EnrollmentStatus = "active" | "waitlist" | "withdrawn" | "graduated";
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AllergySeverity = "mild" | "moderate" | "severe";
export type FeeStatus = "unpaid" | "partial" | "paid" | "waived";
export type TransactionType = "income" | "expense";
export type ApplicationStatus = "pending" | "waitlisted" | "approved" | "rejected";
export type IncidentType = "injury" | "illness" | "medication" | "behaviour" | "other";
export type AnnouncementAudience = "school" | "class" | "staff";
export type DocumentCategory =
  | "birth_certificate"
  | "immunisation"
  | "enrollment_form"
  | "medical"
  | "consent"
  | "other";
export type EventType = "holiday" | "meeting" | "activity" | "closure" | "other";
export type ChildMood = "happy" | "calm" | "tired" | "upset" | "unwell";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type Gender = "male" | "female" | "other" | "undisclosed";

type Tbl<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  accent_color: string | null;
  tagline: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  contact_email: string | null;
  website: string | null;
  timezone: string;
  locale: string;
  currency: string;
  plan: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  status_note: string | null;
  billing_customer_id: string | null;
  billing_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  tenant_id: string | null;
  role: UserRole;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  locale: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: Exclude<UserRole, "super_admin">;
  token_hash: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  class_ids: string[];
  child_ids: string[];
  full_name: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: number;
  tenant_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Json;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type AcademicYearRow = {
  id: string;
  tenant_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TermRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

export type ClassRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  name: string;
  room: string | null;
  capacity: number;
  age_range: string | null;
  colour: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ClassTeacherRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  profile_id: string;
  is_lead: boolean;
  created_at: string;
};

export type ChildRow = {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string;
  gender: Gender | null;
  photo_path: string | null;
  status: EnrollmentStatus;
  notes: string | null;
  pickup_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrollmentRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  child_id: string;
  class_id: string | null;
  status: EnrollmentStatus;
  enrolled_on: string;
  withdrawn_on: string | null;
  created_at: string;
  updated_at: string;
};

export type GuardianRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  profile_id: string;
  relationship: string | null;
  is_primary: boolean;
  can_pickup: boolean;
  created_at: string;
};

export type EmergencyContactRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  name: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type AuthorisedPickupRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  photo_path: string | null;
  id_reference: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ChildAllergyRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  allergen: string;
  severity: AllergySeverity;
  reaction: string;
  required_action: string;
  medication: string | null;
  medication_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ChildMedicalNoteRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  title: string;
  details: string | null;
  medication: string | null;
  action_plan: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceRecordRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  child_id: string;
  class_id: string | null;
  attendance_date: string;
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  dropped_off_by: string | null;
  picked_up_by: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyReportRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  child_id: string;
  class_id: string | null;
  report_date: string;
  mood: ChildMood | null;
  meals: Json;
  naps: Json;
  activities: string | null;
  notes: string | null;
  toileting: string | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportMediaRow = {
  id: string;
  tenant_id: string;
  daily_report_id: string | null;
  child_id: string;
  storage_path: string;
  caption: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type AnnouncementRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  audience: AnnouncementAudience;
  class_id: string | null;
  title: string;
  body: string;
  is_pinned: boolean;
  published_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEventRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  class_id: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  visible_to_parents: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChildDocumentRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  title: string;
  category: DocumentCategory;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  parent_visible: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IncidentRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  child_id: string;
  class_id: string | null;
  incident_type: IncidentType;
  occurred_at: string;
  location: string | null;
  description: string;
  action_taken: string;
  medication_name: string | null;
  medication_dose: string | null;
  administered_by: string | null;
  witness: string | null;
  parent_notified_at: string | null;
  notified_by: string | null;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FeeRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  term_id: string | null;
  child_id: string;
  description: string;
  amount_minor: number;
  currency: string;
  due_date: string | null;
  status: FeeStatus;
  paid_minor: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FeePaymentRow = {
  id: string;
  tenant_id: string;
  fee_id: string;
  amount_minor: number;
  paid_on: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  kind: TransactionType;
  category: string;
  description: string | null;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  fee_payment_id: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationRow = {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  child_first_name: string;
  child_last_name: string;
  date_of_birth: string;
  gender: Gender | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  address: string | null;
  allergies: Json;
  medical_notes: string | null;
  preferred_start: string | null;
  message: string | null;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  child_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformStatsRow = {
  tenant_id: string;
  tenant_name: string;
  slug: string;
  subscription_status: SubscriptionStatus;
  children_count: number;
  staff_count: number;
  parent_count: number;
  class_count: number;
  active_year: string | null;
  created_at: string;
};

export type Database = {
  // Required by @supabase/postgrest-js v2.10+ to select its typing rules.
  // The generated file carries the same marker.
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      tenants: Tbl<TenantRow>;
      profiles: Tbl<ProfileRow>;
      invitations: Tbl<InvitationRow>;
      audit_logs: Tbl<AuditLogRow>;
      academic_years: Tbl<AcademicYearRow>;
      terms: Tbl<TermRow>;
      classes: Tbl<ClassRow>;
      class_teachers: Tbl<ClassTeacherRow>;
      children: Tbl<ChildRow>;
      enrollments: Tbl<EnrollmentRow>;
      guardians: Tbl<GuardianRow>;
      emergency_contacts: Tbl<EmergencyContactRow>;
      authorised_pickups: Tbl<AuthorisedPickupRow>;
      child_allergies: Tbl<ChildAllergyRow>;
      child_medical_notes: Tbl<ChildMedicalNoteRow>;
      attendance_records: Tbl<AttendanceRecordRow>;
      daily_reports: Tbl<DailyReportRow>;
      report_media: Tbl<ReportMediaRow>;
      announcements: Tbl<AnnouncementRow>;
      calendar_events: Tbl<CalendarEventRow>;
      child_documents: Tbl<ChildDocumentRow>;
      incidents: Tbl<IncidentRow>;
      fees: Tbl<FeeRow>;
      fee_payments: Tbl<FeePaymentRow>;
      transactions: Tbl<TransactionRow>;
      applications: Tbl<ApplicationRow>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      user_role: UserRole;
      subscription_status: SubscriptionStatus;
      enrollment_status: EnrollmentStatus;
      attendance_status: AttendanceStatus;
      allergy_severity: AllergySeverity;
      fee_status: FeeStatus;
      transaction_type: TransactionType;
      application_status: ApplicationStatus;
      incident_type: IncidentType;
      announcement_audience: AnnouncementAudience;
      document_category: DocumentCategory;
      event_type: EventType;
      child_mood: ChildMood;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type TableName = keyof Database["public"]["Tables"];

import { z } from "zod";

/**
 * Every server action and route handler validates its input here before it
 * touches the database. These schemas — not the TypeScript types — are the
 * write contract; the database CHECK constraints are the backstop behind them.
 */

// --- Primitives ------------------------------------------------------------

export const uuidSchema = z.string().uuid("Invalid identifier");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(50)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/,
    "Use lowercase letters, numbers and hyphens only",
  );

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");

export const hexColourSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #4F46E5");

export const phoneSchema = z
  .string()
  .trim()
  .min(6, "Enter a valid phone number")
  .max(32)
  .regex(/^[+0-9()\s-]+$/, "Enter a valid phone number");

/** Money is entered as a decimal string/number and stored in minor units. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    const numeric = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
    if (!Number.isFinite(numeric)) return Number.NaN;
    return Math.round(numeric * 100);
  })
  .refine((minor) => Number.isFinite(minor) && minor >= 0, "Enter a valid amount");

export const genderSchema = z.enum(["male", "female", "other", "undisclosed"]);
export const localeSchema = z.enum(["en", "so"]);
export const severitySchema = z.enum(["mild", "moderate", "severe"]);
export const attendanceStatusSchema = z.enum(["present", "absent", "late", "excused"]);
export const invitableRoleSchema = z.enum(["owner", "admin", "teacher", "parent"]);

// --- Tenant ----------------------------------------------------------------

/** Super-admin only: creating a school. */
export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  ownerEmail: emailSchema,
  ownerName: z.string().trim().max(120).optional(),
  plan: z.string().trim().max(40).default("standard"),
  timezone: z.string().trim().max(64).default("Africa/Mogadishu"),
  locale: localeSchema.default("en"),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
});

/** Super-admin only: the manual access switch described in §7bis. */
export const updateSubscriptionSchema = z.object({
  tenantId: uuidSchema,
  subscriptionStatus: z.enum(["trialing", "active", "past_due", "suspended"]),
  plan: z.string().trim().max(40).optional(),
  statusNote: z.string().trim().max(300).optional(),
});

/** School admin: branding, contact and operational settings. Never plan/status. */
export const updateTenantSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(160).optional().or(z.literal("")),
  accentColor: hexColourSchema.optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  contactEmail: emailSchema.optional().or(z.literal("")),
  website: z.string().trim().url().max(200).optional().or(z.literal("")),
  timezone: z.string().trim().max(64),
  locale: localeSchema,
  currency: z.string().trim().length(3).toUpperCase(),
});

// --- Academic year ---------------------------------------------------------

export const academicYearSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    makeActive: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: "The end date must be after the start date",
    path: ["endDate"],
  });

export const termSchema = z
  .object({
    academicYearId: uuidSchema,
    name: z.string().trim().min(1).max(60),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .refine((v) => v.endDate > v.startDate, {
    message: "The end date must be after the start date",
    path: ["endDate"],
  });

// --- Classes ---------------------------------------------------------------

export const classSchema = z.object({
  name: z.string().trim().min(1).max(80),
  room: z.string().trim().max(60).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(200),
  ageRange: z.string().trim().max(40).optional().or(z.literal("")),
  colour: hexColourSchema.optional().or(z.literal("")),
  teacherIds: z.array(uuidSchema).default([]),
});

// --- Children --------------------------------------------------------------

export const allergySchema = z.object({
  allergen: z.string().trim().min(1, "Name the allergen").max(120),
  severity: severitySchema,
  reaction: z.string().trim().min(1, "Describe the reaction").max(400),
  requiredAction: z
    .string()
    .trim()
    .min(1, "Describe exactly what staff must do")
    .max(600),
  medication: z.string().trim().max(120).optional().or(z.literal("")),
  medicationLocation: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(400).optional().or(z.literal("")),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().max(60).optional().or(z.literal("")),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  priority: z.coerce.number().int().min(1).max(9).default(1),
});

export const authorisedPickupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().max(60).optional().or(z.literal("")),
  phone: phoneSchema.optional().or(z.literal("")),
  idReference: z.string().trim().max(60).optional().or(z.literal("")),
});

export const childSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  preferredName: z.string().trim().max(60).optional().or(z.literal("")),
  dateOfBirth: isoDateSchema,
  gender: genderSchema.optional(),
  status: z.enum(["active", "waitlist", "withdrawn", "graduated"]).default("active"),
  classId: uuidSchema.optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  allergies: z.array(allergySchema).max(20).default([]),
  emergencyContacts: z.array(emergencyContactSchema).max(10).default([]),
});

/** Parents may edit this one field on their own child, and nothing else. */
export const pickupNotesSchema = z.object({
  childId: uuidSchema,
  pickupNotes: z.string().trim().max(600),
});

export const medicalNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
  medication: z.string().trim().max(200).optional().or(z.literal("")),
  actionPlan: z.string().trim().max(1000).optional().or(z.literal("")),
  doctorName: z.string().trim().max(120).optional().or(z.literal("")),
  doctorPhone: z.string().trim().max(32).optional().or(z.literal("")),
});

// --- Attendance ------------------------------------------------------------

export const attendanceEntrySchema = z.object({
  childId: uuidSchema,
  status: attendanceStatusSchema,
  checkInAt: z.string().datetime().optional().nullable(),
  checkOutAt: z.string().datetime().optional().nullable(),
  droppedOffBy: z.string().trim().max(120).optional().or(z.literal("")),
  pickedUpBy: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export const saveAttendanceSchema = z.object({
  classId: uuidSchema,
  date: isoDateSchema,
  entries: z.array(attendanceEntrySchema).min(1).max(200),
});

// --- Daily reports ---------------------------------------------------------

export const mealEntrySchema = z.object({
  type: z.enum(["breakfast", "snack_am", "lunch", "snack_pm", "other"]),
  amount: z.enum(["none", "some", "most", "all"]),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const napEntrySchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  to: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
});

export const dailyReportSchema = z.object({
  childId: uuidSchema,
  date: isoDateSchema,
  mood: z.enum(["happy", "calm", "tired", "upset", "unwell"]).optional(),
  meals: z.array(mealEntrySchema).max(8).default([]),
  naps: z.array(napEntrySchema).max(5).default([]),
  activities: z.string().trim().max(1500).optional().or(z.literal("")),
  notes: z.string().trim().max(1500).optional().or(z.literal("")),
  toileting: z.string().trim().max(300).optional().or(z.literal("")),
  publish: z.boolean().default(true),
});

// --- Communication ---------------------------------------------------------

export const announcementSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(["school", "class", "staff"]),
    classId: uuidSchema.optional().or(z.literal("")),
    isPinned: z.boolean().default(false),
  })
  .refine((v) => v.audience !== "class" || Boolean(v.classId), {
    message: "Choose the class this announcement is for",
    path: ["classId"],
  });

export const calendarEventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  eventType: z.enum(["holiday", "meeting", "activity", "closure", "other"]),
  startsAt: z.string().min(1, "Choose a start date and time"),
  endsAt: z.string().optional().or(z.literal("")),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  classId: uuidSchema.optional().or(z.literal("")),
  visibleToParents: z.boolean().default(true),
});

// --- Health & incidents ----------------------------------------------------

export const incidentSchema = z.object({
  childId: uuidSchema,
  incidentType: z.enum(["injury", "illness", "medication", "behaviour", "other"]),
  occurredAt: z.string().min(1, "When did this happen?"),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().min(1, "Describe what happened").max(2000),
  actionTaken: z.string().trim().min(1, "Describe what was done").max(2000),
  medicationName: z.string().trim().max(120).optional().or(z.literal("")),
  medicationDose: z.string().trim().max(60).optional().or(z.literal("")),
  witness: z.string().trim().max(120).optional().or(z.literal("")),
  notifyParent: z.boolean().default(true),
});

// --- Finance ---------------------------------------------------------------

export const feeSchema = z.object({
  childId: uuidSchema,
  termId: uuidSchema.optional().or(z.literal("")),
  description: z.string().trim().min(1).max(160),
  amount: moneySchema,
  dueDate: isoDateSchema.optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const feePaymentSchema = z.object({
  feeId: uuidSchema,
  amount: moneySchema,
  paidOn: isoDateSchema,
  method: z.enum(["cash", "mobile_money", "bank", "other"]).default("cash"),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export const transactionSchema = z.object({
  kind: z.enum(["income", "expense"]),
  category: z.string().trim().min(1).max(60).default("general"),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  amount: moneySchema,
  occurredOn: isoDateSchema,
});

// --- Admissions ------------------------------------------------------------

/** Public form. Allergy details are collected here, before the first day. */
export const applicationSchema = z.object({
  childFirstName: z.string().trim().min(1, "First name is required").max(60),
  childLastName: z.string().trim().min(1, "Last name is required").max(60),
  dateOfBirth: isoDateSchema,
  gender: genderSchema.optional(),
  parentName: z.string().trim().min(1, "Your name is required").max(120),
  parentEmail: emailSchema,
  parentPhone: phoneSchema,
  address: z.string().trim().max(240).optional().or(z.literal("")),
  allergies: z.array(allergySchema).max(10).default([]),
  medicalNotes: z.string().trim().max(1500).optional().or(z.literal("")),
  preferredStart: isoDateSchema.optional().or(z.literal("")),
  message: z.string().trim().max(1500).optional().or(z.literal("")),
});

export const reviewApplicationSchema = z.object({
  applicationId: uuidSchema,
  decision: z.enum(["approved", "waitlisted", "rejected"]),
  classId: uuidSchema.optional().or(z.literal("")),
  reviewNotes: z.string().trim().max(500).optional().or(z.literal("")),
});

// --- Invitations -----------------------------------------------------------

export const inviteStaffSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().max(120).optional().or(z.literal("")),
  role: z.enum(["admin", "teacher"]),
  classIds: z.array(uuidSchema).max(20).default([]),
  message: z.string().trim().max(500).optional().or(z.literal("")),
});

export const inviteParentSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().max(120).optional().or(z.literal("")),
  childIds: z.array(uuidSchema).min(1, "Choose at least one child").max(10),
  message: z.string().trim().max(500).optional().or(z.literal("")),
});

// --- Documents -------------------------------------------------------------

export const documentMetaSchema = z.object({
  childId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  category: z.enum([
    "birth_certificate",
    "immunisation",
    "enrollment_form",
    "medical",
    "consent",
    "other",
  ]),
  parentVisible: z.boolean().default(false),
});

// --- Types -----------------------------------------------------------------

export type ChildInput = z.infer<typeof childSchema>;
export type AllergyInput = z.infer<typeof allergySchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type DailyReportInput = z.infer<typeof dailyReportSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type FeeInput = z.infer<typeof feeSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;

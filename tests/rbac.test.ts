import { describe, expect, it } from "vitest";

import { can, isAdmin, isStaff, permissionsFor } from "@/lib/auth/rbac";
import { worstSeverity, hasSevereAllergy } from "@/lib/safety";
import { formatAge, formatMoney, slugify, todayInTimezone } from "@/lib/utils";
import { interpolate } from "@/lib/i18n/config";
import { allergySchema, moneySchema, slugSchema } from "@/lib/validation/schemas";

/**
 * Pure unit tests — no database, so these run anywhere.
 * The RLS behaviour they mirror is verified for real in tenant-isolation.test.ts.
 */

describe("RBAC matrix", () => {
  it("parents can only view their own children", () => {
    expect(can("parent", "children.view_own")).toBe(true);
    expect(can("parent", "children.view_all")).toBe(false);
    expect(can("parent", "children.view_assigned")).toBe(false);
    expect(can("parent", "children.manage")).toBe(false);
  });

  it("parents cannot touch the school's money or staff", () => {
    expect(can("parent", "finance.view")).toBe(false);
    expect(can("parent", "finance.manage")).toBe(false);
    expect(can("parent", "staff.view")).toBe(false);
    expect(can("parent", "admissions.view")).toBe(false);
    expect(can("parent", "audit.view")).toBe(false);
    // But they can see their own child's fees.
    expect(can("parent", "finance.view_own_child")).toBe(true);
  });

  it("teachers manage their classes but not the school", () => {
    expect(can("teacher", "attendance.record")).toBe(true);
    expect(can("teacher", "reports.write")).toBe(true);
    expect(can("teacher", "incidents.write")).toBe(true);
    expect(can("teacher", "children.view_assigned")).toBe(true);

    expect(can("teacher", "children.manage")).toBe(false);
    expect(can("teacher", "classes.manage")).toBe(false);
    expect(can("teacher", "staff.manage")).toBe(false);
    expect(can("teacher", "finance.view")).toBe(false);
    expect(can("teacher", "tenant.edit_branding")).toBe(false);
    expect(can("teacher", "announcements.post_school")).toBe(false);
  });

  it("teachers may invite parents but not staff", () => {
    expect(can("teacher", "invites.parents")).toBe(true);
    expect(can("teacher", "invites.staff")).toBe(false);
  });

  it("owners and admins run the school but not the platform", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(can(role, "children.manage")).toBe(true);
      expect(can(role, "finance.manage")).toBe(true);
      expect(can(role, "tenant.edit_branding")).toBe(true);
      expect(can(role, "invites.staff")).toBe(true);

      // The subscription switch is the super-admin's alone (§7bis).
      expect(can(role, "tenant.edit_subscription")).toBe(false);
      expect(can(role, "platform.manage_tenants")).toBe(false);
    }
  });

  it("super-admins manage tenants and see no school content", () => {
    expect(can("super_admin", "platform.manage_tenants")).toBe(true);
    expect(can("super_admin", "tenant.edit_subscription")).toBe(true);

    expect(can("super_admin", "children.view_all")).toBe(false);
    expect(can("super_admin", "reports.view")).toBe(false);
    expect(can("super_admin", "attendance.view")).toBe(false);
    expect(can("super_admin", "finance.view")).toBe(false);
    expect(permissionsFor("super_admin")).toHaveLength(2);
  });

  it("classifies staff and admin roles", () => {
    expect(isStaff("owner")).toBe(true);
    expect(isStaff("teacher")).toBe(true);
    expect(isStaff("parent")).toBe(false);
    expect(isAdmin("teacher")).toBe(false);
    expect(isAdmin("admin")).toBe(true);
  });
});

describe("allergy severity ranking", () => {
  it("reports the worst severity present", () => {
    expect(worstSeverity([{ severity: "mild" }, { severity: "severe" }])).toBe("severe");
    expect(worstSeverity([{ severity: "mild" }, { severity: "moderate" }])).toBe("moderate");
    expect(worstSeverity([{ severity: "mild" }])).toBe("mild");
    expect(worstSeverity([])).toBeNull();
  });

  it("flags severe allergies for the loud badge", () => {
    expect(hasSevereAllergy([{ severity: "moderate" }])).toBe(false);
    expect(hasSevereAllergy([{ severity: "moderate" }, { severity: "severe" }])).toBe(true);
  });
});

describe("allergy validation", () => {
  it("requires the action a member of staff must take", () => {
    const result = allergySchema.safeParse({
      allergen: "Peanuts",
      severity: "severe",
      reaction: "Anaphylaxis",
      requiredAction: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete allergy record", () => {
    const result = allergySchema.safeParse({
      allergen: "Peanuts",
      severity: "severe",
      reaction: "Anaphylaxis",
      requiredAction: "EpiPen from the red pouch, then call emergency services.",
    });
    expect(result.success).toBe(true);
  });
});

describe("money handling", () => {
  it("converts decimal input to integer minor units", () => {
    expect(moneySchema.parse("150.00")).toBe(15000);
    expect(moneySchema.parse("150.5")).toBe(15050);
    expect(moneySchema.parse(99.99)).toBe(9999);
    expect(moneySchema.parse("1,250.25")).toBe(125025);
  });

  it("rejects nonsense", () => {
    expect(moneySchema.safeParse("abc").success).toBe(false);
    expect(moneySchema.safeParse("-5").success).toBe(false);
  });

  it("formats minor units back for display", () => {
    expect(formatMoney(15000, "USD")).toContain("150");
  });
});

describe("slugs", () => {
  it("accepts safe slugs and rejects unsafe ones", () => {
    expect(slugSchema.safeParse("little-stars").success).toBe(true);
    expect(slugSchema.safeParse("Little Stars").success).toBe(false);
    expect(slugSchema.safeParse("-leading").success).toBe(false);
    expect(slugSchema.safeParse("trailing-").success).toBe(false);
    expect(slugSchema.safeParse("ab").success).toBe(false);
  });

  it("slugifies free text", () => {
    expect(slugify("Little Stars Kindergarten!")).toBe("little-stars-kindergarten");
  });
});

describe("dates and ages", () => {
  it("reports infant ages in months", () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    expect(formatAge(sixMonthsAgo.toISOString().slice(0, 10))).toBe("6m");
  });

  it("reports older children in years", () => {
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
    expect(formatAge(fourYearsAgo.toISOString().slice(0, 10))).toBe("4y");
  });

  it("resolves the school's own today, not the server's", () => {
    const today = todayInTimezone("Africa/Mogadishu");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("translation interpolation", () => {
  it("fills placeholders and leaves unknown ones alone", () => {
    expect(interpolate("You are joining {school} as {role}.", { school: "Little Stars", role: "a teacher" })).toBe(
      "You are joining Little Stars as a teacher.",
    );
    expect(interpolate("Hello {missing}", {})).toBe("Hello {missing}");
  });
});

describe("dictionary parity", () => {
  it("Somali has every key English has", async () => {
    const { en } = await import("@/lib/i18n/dictionaries/en");
    const { so } = await import("@/lib/i18n/dictionaries/so");

    function keyPaths(object: Record<string, unknown>, prefix = ""): string[] {
      return Object.entries(object).flatMap(([key, value]) =>
        typeof value === "object" && value !== null
          ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    }

    const englishKeys = keyPaths(en as unknown as Record<string, unknown>).sort();
    const somaliKeys = keyPaths(so as unknown as Record<string, unknown>).sort();

    expect(somaliKeys).toEqual(englishKeys);
  });
});

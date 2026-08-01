import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantContext } from "@/lib/auth/session";
import { assertWritable } from "@/lib/auth/session";
import { ClosedAcademicYearError, ForbiddenError } from "@/lib/auth/errors";
import type { Database } from "@/lib/supabase/database.types";

/**
 * THE CENTRAL TENANT-SCOPED DATA-ACCESS LAYER.
 *
 * Rule: no feature code calls `supabase.from(...)` directly on a tenant-owned
 * table. It goes through a `TenantScope`, which:
 *
 *   - appends `.eq('tenant_id', ctx.tenantId)` to every read;
 *   - stamps `tenant_id` on every insert, and rejects any payload that tries
 *     to carry a different one;
 *   - refuses to let an update or delete widen past the caller's tenant;
 *   - checks `subscription_status` before any write (§7bis).
 *
 * RLS in Postgres already enforces all of this. That is the point: this layer
 * is the second, independent check, so a mistake in one place is caught by the
 * other. It also turns a would-be silent empty result into a clear error.
 */

type Tables = Database["public"]["Tables"];

/** Every table carrying a `tenant_id`. `tenants` itself is excluded. */
export type TenantTable = Exclude<keyof Tables, "tenants">;

/** Tables that are also scoped to an academic year. */
export const YEAR_SCOPED_TABLES = [
  "terms",
  "classes",
  "enrollments",
  "attendance_records",
  "daily_reports",
  "announcements",
  "calendar_events",
  "incidents",
  "fees",
  "transactions",
  "applications",
] as const;

export type YearScopedTable = (typeof YEAR_SCOPED_TABLES)[number];

type Row<T extends TenantTable> = Tables[T]["Row"];
type Insert<T extends TenantTable> = Tables[T]["Insert"];

/**
 * A view of the same client with the table generics erased.
 *
 * PostgREST's types cannot express "every table in this union has a tenant_id
 * column", so `.eq('tenant_id', …)` on a generic table parameter does not
 * typecheck. Erasing the generic here is contained and deliberate: the write
 * payloads are still checked against `Insert<T>` on the public methods below,
 * and callers cast query results to the Row types they asked for.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type UntypedDb = SupabaseClient<any, "public", any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export class TenantScope {
  readonly ctx: TenantContext;

  constructor(ctx: TenantContext) {
    this.ctx = ctx;
  }

  /** Internal escape hatch — see the note on `UntypedDb`. */
  private get raw(): UntypedDb {
    return this.ctx.supabase as unknown as UntypedDb;
  }

  get tenantId(): string {
    return this.ctx.tenantId;
  }

  get activeYearId(): string | null {
    return this.ctx.activeYear?.id ?? null;
  }

  /** Read. Always filtered to the caller's tenant. */
  select(table: TenantTable, columns = "*") {
    return this.raw.from(table).select(columns).eq("tenant_id", this.ctx.tenantId);
  }

  /** Read a single row by id, still tenant-filtered. */
  selectById(table: TenantTable, id: string, columns = "*") {
    return this.raw
      .from(table)
      .select(columns)
      .eq("tenant_id", this.ctx.tenantId)
      .eq("id", id)
      .maybeSingle();
  }

  /** Read scoped to both the tenant and a specific academic year. */
  selectForYear(table: YearScopedTable, academicYearId: string, columns = "*") {
    return this.raw
      .from(table)
      .select(columns)
      .eq("tenant_id", this.ctx.tenantId)
      .eq("academic_year_id", academicYearId);
  }

  /**
   * Insert. `tenant_id` is stamped from the session, never taken from input.
   * A payload carrying a foreign tenant_id is treated as an attack, not a
   * mistake to be quietly corrected.
   */
  insert<T extends TenantTable>(table: T, values: Insert<T> | Insert<T>[]) {
    assertWritable(this.ctx);

    const stamp = (value: Insert<T>): Insert<T> => {
      const incoming = (value as Record<string, unknown>).tenant_id;
      if (incoming !== undefined && incoming !== this.ctx.tenantId) {
        throw new ForbiddenError("Cross-tenant write rejected.");
      }
      return { ...value, tenant_id: this.ctx.tenantId } as Insert<T>;
    };

    const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
    return this.raw.from(table).insert(payload as never);
  }

  /** Upsert, same tenant stamping as `insert`. */
  upsert<T extends TenantTable>(
    table: T,
    values: Insert<T> | Insert<T>[],
    options?: { onConflict?: string },
  ) {
    assertWritable(this.ctx);

    const stamp = (value: Insert<T>): Insert<T> => {
      const incoming = (value as Record<string, unknown>).tenant_id;
      if (incoming !== undefined && incoming !== this.ctx.tenantId) {
        throw new ForbiddenError("Cross-tenant write rejected.");
      }
      return { ...value, tenant_id: this.ctx.tenantId } as Insert<T>;
    };

    const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
    return this.raw.from(table).upsert(payload as never, options);
  }

  /**
   * Update by id. Both the tenant filter and the id are applied, so an
   * attacker-supplied id from another school matches zero rows.
   */
  update<T extends TenantTable>(table: T, id: string, values: Partial<Row<T>>) {
    assertWritable(this.ctx);

    const patch = { ...values } as Record<string, unknown>;
    // tenant_id is immutable. Silently dropping it is safer than trusting it.
    delete patch.tenant_id;
    delete patch.id;

    return this.raw
      .from(table)
      .update(patch as never)
      .eq("tenant_id", this.ctx.tenantId)
      .eq("id", id);
  }

  /** Delete by id, tenant-filtered. Prefer soft-delete/status columns. */
  delete(table: TenantTable, id: string) {
    assertWritable(this.ctx);
    return this.raw.from(table).delete().eq("tenant_id", this.ctx.tenantId).eq("id", id);
  }

  /** Row count for a table, tenant-filtered. */
  async count(
    table: TenantTable,
    apply?: (q: ReturnType<TenantScope["select"]>) => ReturnType<TenantScope["select"]>,
  ): Promise<number> {
    let query = this.raw
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", this.ctx.tenantId) as unknown as ReturnType<TenantScope["select"]>;

    if (apply) query = apply(query);

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * The active academic year, or a clear error. Year-bound writes call this
   * rather than accepting an `academic_year_id` from the client.
   */
  requireActiveYearId(): string {
    const id = this.activeYearId;
    if (!id) {
      throw new ClosedAcademicYearError(
        "No active academic year. An administrator must create one before this can be used.",
      );
    }
    return id;
  }

  /**
   * Guards the "old years are read-only history" rule. Writes are only
   * permitted against the active year; everything else is viewable but frozen.
   */
  assertYearWritable(academicYearId: string): void {
    if (academicYearId !== this.requireActiveYearId()) {
      throw new ClosedAcademicYearError();
    }
  }
}

export function scoped(ctx: TenantContext): TenantScope {
  return new TenantScope(ctx);
}

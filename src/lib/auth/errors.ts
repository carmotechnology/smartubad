/**
 * Typed failures for the authorisation layer.
 *
 * These are thrown deep in the data-access layer and caught at the route /
 * server-action boundary, so a missed check surfaces as a 403 instead of
 * leaking data or a raw Postgres error.
 */

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(message = "You must be signed in.") {
    super(message, "unauthenticated", 401);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden", 403);
    this.name = "ForbiddenError";
  }
}

export class TenantNotFoundError extends AuthError {
  constructor(message = "School not found.") {
    super(message, "tenant_not_found", 404);
    this.name = "TenantNotFoundError";
  }
}

/**
 * Thrown when a tenant is `past_due` or `suspended` and a write is attempted.
 * Section 7bis: reads keep working, writes do not, and nothing is deleted.
 */
export class SubscriptionInactiveError extends AuthError {
  constructor(
    message = "This school's subscription is inactive. The app is read-only until it is reactivated.",
  ) {
    super(message, "subscription_inactive", 402);
    this.name = "SubscriptionInactiveError";
  }
}

/** Thrown when a write targets a closed (non-active) academic year. */
export class ClosedAcademicYearError extends AuthError {
  constructor(message = "That academic year is closed. Past years are read-only history.") {
    super(message, "academic_year_closed", 409);
    this.name = "ClosedAcademicYearError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

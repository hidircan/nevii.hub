/** Structured JSON contract for Web, Mobile, and AI agents */

export type ServiceErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ServiceSuccess<T> = {
  ok: true;
  data: T;
};

export type ServiceFailure = {
  ok: false;
  error: {
    code: ServiceErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export function ok<T>(data: T): ServiceSuccess<T> {
  return { ok: true, data };
}

export function fail(
  code: ServiceErrorCode,
  message: string,
  details?: unknown
): ServiceFailure {
  return { ok: false, error: { code, message, details } };
}

export function fromZodError(error: unknown): ServiceFailure {
  return fail("VALIDATION_ERROR", "Invalid input", error);
}

import { createError, type EvlogError } from "evlog";
import { initWorkersLogger } from "evlog/workers";

initWorkersLogger({
  env: {
    service: "twitmarks",
    environment: import.meta.env?.MODE ?? "development",
  },
  pretty: import.meta.env?.MODE !== "production",
});

export const errors = {
  notFound: (resource: string) =>
    createError({
      message: `${resource} not found`,
      status: 404,
      why: `The requested ${resource} does not exist in the database`,
      fix: `Verify the ${resource} ID and try again`,
    }),

  unauthorized: (reason?: string) =>
    createError({
      message: "Unauthorized",
      status: 401,
      why: reason ?? "Missing or invalid authentication credentials",
      fix: "Provide valid authentication credentials and try again",
    }),

  badRequest: (field: string, issue: string) =>
    createError({
      message: `Invalid ${field}`,
      status: 400,
      why: issue,
      fix: `Please provide a valid ${field}`,
    }),

  tooManyRequests: (retryAfterSeconds: number) =>
    Object.assign(
      createError({
        message: "Too many requests",
        status: 429,
        why: "Rate limit exceeded",
        fix: "Wait a moment and try again",
      }),
      { retryAfter: retryAfterSeconds }
    ),

  database: (operation: string, cause?: unknown) =>
    createError({
      message: "Database operation failed",
      status: 500,
      why: `Failed to ${operation}`,
      cause: cause instanceof Error ? cause : undefined,
    }),

  internal: (message: string, cause?: unknown) =>
    createError({
      message,
      status: 500,
      why: "An unexpected error occurred on the server",
      cause: cause instanceof Error ? cause : undefined,
    }),
};

export function ensureEvlogError(
  error: unknown,
  defaultMessage = "An unexpected error occurred"
): EvlogError {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    "status" in error
  ) {
    return error as EvlogError;
  }

  return createError({
    message: defaultMessage,
    status: 500,
    why: "An unexpected error occurred on the server",
    cause: error instanceof Error ? error : undefined,
  });
}

export function errorToObject(error: EvlogError): Record<string, unknown> {
  if (error.status >= 500) {
    return {
      error: "Internal server error",
      status: error.status,
    };
  }

  return {
    error: error.message,
    status: error.status,
    why: error.why,
    fix: error.fix,
    link: error.link,
  };
}

export function sanitize<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = [
    "password",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "credential",
  ]
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of sensitiveKeys) {
    if (key in result) {
      delete result[key];
    }
  }
  return result;
}

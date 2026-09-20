import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { getEnv } from './env';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError('BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'You must be signed in to do that.') {
    return new ApiError('UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError('FORBIDDEN', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError('NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError('CONFLICT', message, details);
  }
  static invalidState(message: string, details?: unknown) {
    return new ApiError('INVALID_STATE', message, details);
  }
  static rateLimited(message = 'Too many requests. Slow down.') {
    return new ApiError('RATE_LIMITED', message);
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function jsonError(error: ApiError) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details ?? null } },
    { status: error.status },
  );
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      fieldErrors[issue.path.join('.') || '_'] = issue.message;
    }
    return new ApiError('VALIDATION_FAILED', 'Some fields need attention.', fieldErrors);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      return new ApiError('CONFLICT', `That ${target} is already taken.`);
    }
    if (error.code === 'P2025') {
      return new ApiError('NOT_FOUND', 'The requested record no longer exists.');
    }
  }

  console.error('[api] unhandled error:', error);
  return new ApiError('INTERNAL', 'Something went wrong on our side.');
}

/**
 * Wraps a route handler so every failure path returns a predictable JSON body
 * and nothing sensitive leaks into the response.
 */
export async function route(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

/**
 * Generic over the schema rather than over a value type, so schemas that use
 * `.default()` (where the parsed output is wider than the input) still infer
 * correctly at the call site.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
  return schema.parse(payload) as z.infer<S>;
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): z.infer<S> {
  const url = new URL(request.url);
  const entries: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    entries[key] = value;
  });
  return schema.parse(entries) as z.infer<S>;
}

/**
 * Cookie-based sessions need CSRF protection for state-changing verbs. Cookies
 * are SameSite=Lax already; this adds a second, explicit origin check so a
 * cross-site form post can never reach a mutating handler.
 */
export function assertTrustedOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = request.headers.get('origin');
  if (!origin) return; // Same-origin fetches from some clients omit Origin.

  const allowed = new Set<string>([getEnv().APP_URL]);
  const host = request.headers.get('host');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }

  if (!allowed.has(origin)) {
    throw ApiError.forbidden('Cross-origin request blocked.');
  }
}

/** Best-effort client identity for rate limiting and audit logs. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Browser API client.
 *
 * Every endpoint answers with `{ data }` or `{ error }`, so this unwraps the
 * envelope and turns failures into a typed error the UI can render inline
 * (including per-field validation messages).
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details: Record<string, string> | null;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = error.code;
    this.fieldErrors = error.details ?? null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorShape } | null)?.error ?? {
      code: 'INTERNAL',
      message: 'Something went wrong.',
      details: null,
    };
    throw new ApiClientError(response.status, error);
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, form: FormData) => {
    const response = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (payload as { error?: ApiErrorShape } | null)?.error ?? {
        code: 'INTERNAL',
        message: 'Upload failed.',
        details: null,
      };
      throw new ApiClientError(response.status, error);
    }
    return (payload as { data: T }).data;
  },
};

/** Default SWR fetcher. */
export const fetcher = <T>(path: string) => api.get<T>(path);

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

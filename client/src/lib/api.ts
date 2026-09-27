import type { ApiErrorBody } from '@/types/api';

const BASE = '/api';

/** A failed request, carrying the server's error envelope (PRD 8.1). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field: string; constraint: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * The access token lives in memory only.
 *
 * Not in localStorage: anything a script can read, an injected script can exfiltrate. The
 * long-lived half of the session is the httpOnly refresh cookie, which JavaScript cannot
 * touch at all, and a reload simply refreshes from it.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let inFlightRefresh: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // A non-JSON error body (a proxy timeout, say) still has to surface as an ApiError.
  }

  return new ApiError(
    response.status,
    body.error ?? 'INTERNAL_ERROR',
    body.message ?? response.statusText ?? 'Request failed',
    body.details,
  );
}

async function performRefresh(): Promise<boolean> {
  const response = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    accessToken = null;
    return false;
  }

  const body = (await response.json()) as { accessToken: string };
  accessToken = body.accessToken;
  return true;
}

/**
 * Attempts a token refresh; returns true when a new access token was obtained.
 *
 * Concurrent callers share one request. Refresh tokens are single-use and rotated on the
 * server, so if the dashboard's queries all hit a 401 at once and each fired its own
 * refresh, exactly one would succeed and the rest would 401 -- clearing the very token the
 * winner had just stored and signing the user out mid-session.
 */
function refreshSession(): Promise<boolean> {
  inFlightRefresh ??= performRefresh().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Set for multipart uploads, where the browser must choose the Content-Type itself. */
  raw?: boolean;
}

/**
 * Performs an authenticated request, transparently refreshing an expired access token once.
 *
 * Access tokens last 15 minutes, so an app left open in the background will routinely find
 * its token stale; retrying after a refresh keeps that invisible to the user.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.raw) {
        body = options.body as BodyInit;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    return fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      signal: options.signal,
      headers,
      body,
    });
  };

  let response = await send();

  if (response.status === 401 && (await refreshSession())) {
    response = await send();
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.isUnauthorized) onSessionLost?.();
    throw error;
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form, raw: true }),
  refreshSession,
};

/** Builds a query string, dropping empty values so the URL stays readable. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

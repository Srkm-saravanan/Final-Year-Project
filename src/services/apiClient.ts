export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiClientError';
  }
}

let refreshPromise: Promise<boolean> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function attemptTokenRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const SKIP_REFRESH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && allowRefresh && !SKIP_REFRESH_PATHS.has(path)) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      return apiRequest<T>(path, options, false);
    }
    sessionExpiredHandler?.();
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await response.json()) as ApiEnvelope<T>;
  } catch {
    json = null;
  }

  if (!response.ok || !json || !json.success || json.data === undefined) {
    const err = json?.error;
    throw new ApiClientError(
      response.status,
      err?.code ?? `HTTP_${response.status}`,
      err?.message ?? `Request failed with status ${response.status}`,
      err?.details
    );
  }

  return json.data;
}


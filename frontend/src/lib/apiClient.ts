const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  authToken?: string | null
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  // Parse the response body (may be JSON or empty)
  let data: unknown;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, data, message);
  }

  return data as T;
}

export const apiClient = {
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
};

// ── Authenticated helpers — include Bearer token ───────────────────────────
// Kept separate from apiClient to avoid circular dependency with auth.ts.
export function authedGet<T>(path: string, token: string): Promise<T> {
  return request<T>('GET', path, undefined, token);
}

export function authedPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body, token);
}

export function authedDel<T>(path: string, token: string): Promise<T> {
  return request<T>('DELETE', path, undefined, token);
}

export default apiClient;

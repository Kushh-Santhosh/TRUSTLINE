/**
 * M4.6 — Token storage
 * In-memory getters/setters for access + refresh tokens.
 * No localStorage by design — tokens live only for the page session.
 * Replace with a secure HttpOnly cookie pattern in post-MVP hardening (M7).
 */

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(at: string, rt: string): void {
  accessToken = at;
  refreshToken = rt;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

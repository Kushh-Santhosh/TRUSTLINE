/**
 * M4.6 — Token storage
 * Access + refresh token helpers.
 * sessionStorage preserves the current browser tab across SPA route changes and
 * reloads without retaining authentication after the browser session ends.
 */

const ACCESS_TOKEN_KEY = 'trustline.accessToken';
const REFRESH_TOKEN_KEY = 'trustline.refreshToken';

function readSessionToken(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(key);
}

let accessToken: string | null = readSessionToken(ACCESS_TOKEN_KEY);
let refreshToken: string | null = readSessionToken(REFRESH_TOKEN_KEY);

export function setTokens(at: string, rt: string): void {
  accessToken = at;
  refreshToken = rt;
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, at);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, rt);
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
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

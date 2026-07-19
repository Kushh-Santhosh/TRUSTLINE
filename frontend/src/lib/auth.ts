// Access + refresh token storage using sessionStorage.
// Tokens survive SPA route changes and reloads, but are cleared when the
// browser session ends (tab or window close).

const ACCESS_TOKEN_KEY  = 'trustline.accessToken';
const REFRESH_TOKEN_KEY = 'trustline.refreshToken';

let accessToken:  string | null = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
let refreshToken: string | null = window.sessionStorage.getItem(REFRESH_TOKEN_KEY);

export function setTokens(at: string, rt: string): void {
  accessToken  = at;
  refreshToken = rt;
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, at);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, rt);
}

export function getAccessToken():  string | null { return accessToken;  }
export function getRefreshToken(): string | null { return refreshToken; }

export function clearTokens(): void {
  accessToken  = null;
  refreshToken = null;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

/**
 * Where the bearer tokens live: `sessionStorage`, with a module variable in front of it.
 *
 * sessionStorage is per browser TAB: a reload keeps the user signed in, while a different tab (or
 * window) has its own empty storage, so an admin, a manager and a contributor can each be signed in
 * in their own tab of the same browser without logging each other out. It is cleared when the tab
 * closes. The price (see ADR 0018): any script running on the page (XSS) can read it, which memory
 * alone would not allow; the strict CSP and React's escaping remain the defence.
 *
 * Every storage access is wrapped: storage can be unavailable (blocked, private mode), and the
 * app then simply behaves as before (tokens in memory only, reload signs out).
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const KEY = 'timesheets.tokens';

function readStored(): TokenPair | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as TokenPair).accessToken === 'string' &&
      typeof (value as TokenPair).refreshToken === 'string'
    ) {
      const { accessToken, refreshToken } = value as TokenPair;
      return { accessToken, refreshToken };
    }
  } catch {
    // unavailable or corrupt: treat as signed out
  }
  return null;
}

function writeStored(next: TokenPair | null): void {
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the in-memory copy still works for this page load
  }
}

let tokens: TokenPair | null = readStored();

export const getAccessToken = (): string | null => tokens?.accessToken ?? null;
export const getRefreshToken = (): string | null => tokens?.refreshToken ?? null;
export const hasTokens = (): boolean => tokens !== null;
export const setTokens = (next: TokenPair): void => {
  tokens = next;
  writeStored(next);
};
export const clearTokens = (): void => {
  tokens = null;
  writeStored(null);
};

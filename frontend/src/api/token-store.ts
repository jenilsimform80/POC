/**
 * Where the bearer tokens live: a plain module variable, i.e. JavaScript memory only.
 *
 * Deliberately NOT localStorage/sessionStorage/cookies: anything stored there can be read by any
 * script that runs on the page (XSS). Memory is not magically safe (XSS can still call the API
 * while the tab is open) but a stolen token cannot be carried away and reused later. The price:
 * reloading the page (or opening a new tab) signs the user out.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let tokens: TokenPair | null = null;

export const getAccessToken = (): string | null => tokens?.accessToken ?? null;
export const getRefreshToken = (): string | null => tokens?.refreshToken ?? null;
export const hasTokens = (): boolean => tokens !== null;
export const setTokens = (next: TokenPair): void => {
  tokens = next;
};
export const clearTokens = (): void => {
  tokens = null;
};

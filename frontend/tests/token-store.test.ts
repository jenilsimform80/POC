import { afterEach, describe, expect, it } from 'vitest';
import { clearTokens, getRefreshToken, hasTokens, setTokens } from '../src/api/token-store';

afterEach(() => clearTokens());

describe('token store', () => {
  it('keeps the tokens in sessionStorage (per tab) and never in localStorage', () => {
    setTokens({ accessToken: 'a', refreshToken: 'r' });

    expect(getRefreshToken()).toBe('r');
    expect(window.sessionStorage.getItem('timesheets.tokens')).toContain('"refreshToken":"r"');
    expect(window.localStorage.length).toBe(0);
  });

  it('forgets them everywhere on clear', () => {
    setTokens({ accessToken: 'a', refreshToken: 'r' });
    clearTokens();

    expect(hasTokens()).toBe(false);
    expect(window.sessionStorage.getItem('timesheets.tokens')).toBeNull();
  });
});

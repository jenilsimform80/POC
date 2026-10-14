import { describe, expect, it } from 'vitest';
import { loadConfig, parseApiBaseUrl } from '../src/config/env';

describe('parseApiBaseUrl', () => {
  it('defaults to the same-origin /api path', () => {
    expect(parseApiBaseUrl(undefined)).toBe('/api');
    expect(parseApiBaseUrl('')).toBe('/api');
    expect(parseApiBaseUrl('   ')).toBe('/api');
  });

  it('accepts a path or an http(s) URL and strips trailing slashes', () => {
    expect(parseApiBaseUrl('/backend/api/')).toBe('/backend/api');
    expect(parseApiBaseUrl('https://api.example.com/api///')).toBe('https://api.example.com/api');
    expect(parseApiBaseUrl('http://localhost:3000/api')).toBe('http://localhost:3000/api');
  });

  it('rejects anything else with a clear message', () => {
    expect(() => parseApiBaseUrl('api')).toThrow(/Invalid VITE_API_URL/);
    expect(() => parseApiBaseUrl('ftp://x/api')).toThrow(/Invalid VITE_API_URL/);
    expect(() => parseApiBaseUrl('javascript:alert(1)')).toThrow(/Invalid VITE_API_URL/);
  });
});

describe('loadConfig', () => {
  it('reads VITE_API_URL from the environment object', () => {
    expect(loadConfig({ VITE_API_URL: '/x/' } as ImportMetaEnv).apiBaseUrl).toBe('/x');
    expect(loadConfig({} as ImportMetaEnv).apiBaseUrl).toBe('/api');
  });
});

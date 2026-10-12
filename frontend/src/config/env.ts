/** Runtime configuration derived from Vite environment variables (validated once at startup). */
export interface AppConfig {
  /** API base without a trailing slash, e.g. "/api" or "https://api.example.com/api". */
  apiBaseUrl: string;
}

const DEFAULT_API_BASE_URL = '/api';

export function parseApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_API_BASE_URL;
  if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) {
    throw new Error(
      `Invalid VITE_API_BASE_URL "${value}": use a path starting with "/" or an http(s) URL.`,
    );
  }
  return value.replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
}

export function loadConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return { apiBaseUrl: parseApiBaseUrl(env.VITE_API_BASE_URL) };
}

export const config: AppConfig = loadConfig();

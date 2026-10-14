/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for API calls, e.g. "http://localhost:3000/api"; defaults to the same-origin path "/api". */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

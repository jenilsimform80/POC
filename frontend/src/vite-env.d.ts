/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for API calls; defaults to the same-origin path "/api". */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

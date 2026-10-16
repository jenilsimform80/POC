# 0008. Frontend foundation: stack, API access and pinned versions

Status: Accepted (Phase 7).

## Decisions
- **Stack:** React 19, TypeScript (strict), Vite 8, React Router 7, Vitest + React Testing Library (jsdom), ESLint 10 (type-aware, react-hooks, react-refresh), Prettier. Plain **CSS Modules** plus a few CSS variables (light/dark via `prefers-color-scheme`) instead of a UI library: a POC with a handful of screens does not need one, and it avoids a large dependency.
- **React Router pinned to 7.x (`^7.18.4`)**, not the newest 8.x: `react-router@8` requires Node ≥ 22.22 and this project runs on Node 22.18 (the backend `engines` allows ≥ 22.12). 7.x supports Node ≥ 20 and has everything used here (data router, `NavLink`, route `errorElement`). Revisit when the minimum Node is raised. **TypeScript is pinned to 6.0.x** for the same reason as the backend (ADR 0001: typescript-eslint support).
- **Same-origin API access through a Vite proxy.** The browser only talks to the Vite origin; `/api/*` is forwarded to the backend (`DEV_API_PROXY_TARGET`, default `http://localhost:3000`). Consequences: the `HttpOnly; SameSite=Lax` session cookie is first-party (no cross-site cookie problems), no CORS preflights, and the backend's Origin check (ADR 0003) passes because the browser's `Origin` is the Vite origin. In production the same shape is achieved by a reverse proxy (Phase 10). The base URL is configurable (`VITE_API_BASE_URL`, default `/api`) and validated at startup.
- **One API client.** `src/api/client.ts` is the only place that calls `fetch`: `credentials: 'include'`, JSON in/out, every failure becomes an `ApiError` (`status`, backend `code`, `message`, `details`; `status 0 / NETWORK_ERROR` when no response arrives; `UNEXPECTED_RESPONSE` for non-envelope errors, whose body is never shown). Cancellation (`AbortError`) is passed through. Endpoint modules (`src/api/health.ts`, later per feature) are thin typed wrappers.
- **Standard async states.** `useAsync` (loading / success / error + `reload`, abort on unmount/reload, stale responses ignored, "loading" derived rather than set in an effect) and `AsyncView` (loading, error with retry, empty, success) so every data-backed screen handles the four states the same way. Error text shown to users is the backend's message for `ApiError`, a fixed generic text for anything else.
- **One route table** (`src/routes`) used by the browser router and by tests; the root route has an `errorElement` so a crashing page shows an error page, not a blank screen.
- **Security stance:** the UI is never the security boundary. It does not hide data for security, only for convenience; the backend enforces every permission and the period lock. No tokens are stored in JS (the session cookie is `HttpOnly`).

## Alternatives
- Tailwind/MUI/Chakra (faster to look polished, but a large dependency and style system for a POC); TanStack Query (excellent, but one more dependency for what `useAsync` covers at this size; revisit if caching/pagination becomes complex in Phase 8); calling the API cross-origin with CORS and `SameSite=None` cookies (works, but weaker and harder to run locally); `createBrowserRouter` vs `<BrowserRouter>` (the data router gives route-level `errorElement`).

## Known limitations
- No authentication UI, no 401 handling yet (Phase 8 adds login and a central "session expired" reaction to a 401).
- Opening the dev app at `http://127.0.0.1:5173` instead of `http://localhost:5173` makes state-changing requests fail with 403: the backend's `FRONTEND_URL` default allows only `http://localhost:5173` (verified).
- No end-to-end browser test yet (Phase 9). Connectivity was verified by running the real backend and Vite and exercising the proxy with HTTP requests, plus unit/integration tests with a stubbed `fetch`.

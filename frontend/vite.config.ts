import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the dev server forwards `/api/*`. The browser only ever talks to the Vite origin, so
  // the session cookie stays same-origin (no CORS, no SameSite surprises).
  const apiTarget = env['DEV_API_PROXY_TARGET'] ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true, // the backend's CORS_ORIGIN default expects exactly http://localhost:5173
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: { port: 4173, proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  };
});

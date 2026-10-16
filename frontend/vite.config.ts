import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // the backend's FRONTEND_URL default expects exactly http://localhost:5173
  },
  preview: { port: 4173 },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    env: { VITE_API_URL: '' }, // tests assume the default same-origin "/api", whatever a local .env says
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});

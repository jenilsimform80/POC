import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearTokens } from '../src/api/token-store';
import { assertNoUnmatchedRequests } from './helpers';

afterEach(() => {
  cleanup();
  clearTokens();
  assertNoUnmatchedRequests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { apiRequest } from './client';
import { ApiError } from './errors';

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface DatabaseHealthResponse {
  status: 'ok' | 'unavailable';
  database: 'up' | 'down';
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', signal ? { signal } : {});
}

function isDatabaseHealth(value: unknown): value is DatabaseHealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'database' in value &&
    (value.database === 'up' || value.database === 'down')
  );
}

/**
 * `GET /api/health/db` answers 503 with `{status:"unavailable",database:"down"}` when the database
 * is unreachable. That is a valid *answer*, not a transport failure, so it is returned as data.
 */
export async function getDatabaseHealth(signal?: AbortSignal): Promise<DatabaseHealthResponse> {
  try {
    return await apiRequest<DatabaseHealthResponse>('/health/db', signal ? { signal } : {});
  } catch (error) {
    if (error instanceof ApiError && error.status === 503 && isDatabaseHealth(error.body)) {
      return error.body;
    }
    throw error;
  }
}

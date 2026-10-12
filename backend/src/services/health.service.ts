import type { DatabaseProbe } from '../db/prisma.js';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface DatabaseHealth {
  status: 'ok' | 'unavailable';
  database: 'up' | 'down';
}

export function getHealthStatus(now: Date = new Date()): HealthStatus {
  return {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: now.toISOString(),
  };
}

/** Runs a trivial query; never throws, so callers can map the result to 200/503. */
export async function getDatabaseHealth(
  db: DatabaseProbe,
  onError?: (error: unknown) => void,
): Promise<DatabaseHealth> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  } catch (error) {
    // The client only learns up/down; operators get the cause in the server log.
    onError?.(error);
    return { status: 'unavailable', database: 'down' };
  }
}

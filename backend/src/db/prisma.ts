import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Advisory-lock waits happen inside interactive transactions; give them explicit, generous
    // limits instead of relying on defaults. A timeout surfaces as a retryable 503.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

/** The slice of the Prisma client the health check needs (lets tests pass a fake). */
export type DatabaseProbe = Pick<PrismaClient, '$queryRaw'>;

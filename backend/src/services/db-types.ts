import type { Prisma } from '../generated/prisma/client.js';

/** Either the main client or an interactive-transaction client (PrismaClient is assignable). */
export type Db = Prisma.TransactionClient;

import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './db/prisma.js';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const app = createApp(env, { prisma });

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

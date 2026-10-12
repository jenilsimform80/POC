import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import { listAuditLogs } from '../services/audit.service.js';
import type { listAuditSchemas } from '../validation/audit.schemas.js';

export function createAuditController(prisma: PrismaClient) {
  const list: RequestHandler = async (req, res) => {
    const { query } = getValidated<typeof listAuditSchemas>(res);
    res.status(200).json({ auditLogs: await listAuditLogs(prisma, requireAuth(req), query) });
  };
  return { list };
}

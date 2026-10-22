import { z } from 'zod';
import { uuid } from './common.js';

export const listAuditSchemas = {
  query: z.object({
    action: z
      .enum([
        'SUBMISSION_SUBMITTED',
        'SUBMISSION_APPROVED',
        'SUBMISSION_REJECTED',
        'PERIOD_LOCKED',
        'PERIOD_UNLOCKED',
        'PASSWORD_RESET',
      ])
      .optional(),
    entityType: z.enum(['weekly_submission', 'locked_period', 'user']).optional(),
    entityId: uuid.optional(),
    actorId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
};

import { z } from 'zod';
import { mondayDate, queryBoolean, uuid } from './common.js';

const comment = z.string().trim().max(1000);

export const submitWeekSchemas = { body: z.strictObject({ weekStart: mondayDate }) };

export const listSubmissionsSchemas = {
  query: z.object({
    status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    weekStart: mondayDate.optional(),
    userId: uuid.optional(),
    forApproval: queryBoolean.optional(),
  }),
};

export const submissionIdSchemas = { params: z.object({ id: uuid }) };

export const approveSchemas = {
  params: z.object({ id: uuid }),
  body: z.strictObject({ comment: comment.optional() }).optional(),
};

export const rejectSchemas = {
  params: z.object({ id: uuid }),
  // A rejection must explain what to fix.
  body: z.strictObject({ comment: comment.min(1, 'a reason is required when rejecting') }),
};

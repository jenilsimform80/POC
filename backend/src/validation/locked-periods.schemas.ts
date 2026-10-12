import { z } from 'zod';

/** A calendar month, "YYYY-MM". */
const period = z
  .string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, 'must be a month in YYYY-MM format, years 2000-2100');

export const lockPeriodSchemas = {
  body: z.strictObject({ period, note: z.string().trim().min(1).max(500).optional() }),
};

export const unlockPeriodSchemas = {
  params: z.object({ period }),
  // Unlocking reopens billed data, so a real reason is mandatory (it is written to the audit trail).
  body: z.strictObject({ reason: z.string().trim().min(3, 'a reason is required').max(500) }),
};

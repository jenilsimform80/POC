import { z } from 'zod';

export const loginBodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // Upper bound stops absurdly large inputs from being hashed.
  password: z.string().min(1).max(128),
});
export const loginSchemas = { body: loginBodySchema };

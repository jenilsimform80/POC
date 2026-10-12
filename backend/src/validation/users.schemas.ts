import { z } from 'zod';

export const userIdParamsSchema = z.object({ id: z.uuid() });
export const getUserSchemas = { params: userIdParamsSchema };

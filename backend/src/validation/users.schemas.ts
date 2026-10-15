import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './common.js';

export const userIdParamsSchema = z.object({ id: z.uuid() });
export const getUserSchemas = { params: userIdParamsSchema };

/**
 * Admins can create contributors and managers only. Creating admins is deliberately not possible
 * through the API (privilege escalation surface); admin accounts come from the seed or the database.
 */
export const CREATABLE_ROLES = ['CONTRIBUTOR', 'MANAGER'] as const;

export const createUserSchemas = {
  body: z
    .strictObject({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      name: z.string().trim().min(1).max(120),
      role: z.enum(CREATABLE_ROLES),
      // The upper bound stops absurdly large inputs being hashed.
      password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
      managerId: z.uuid().optional(),
    })
    .superRefine((body, ctx) => {
      // Plain comparisons only: this also runs on raw input when another field already failed.
      if (body.role === 'CONTRIBUTOR' && body.managerId === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['managerId'],
          message: 'a contributor needs a manager',
        });
      }
      if (body.role === 'MANAGER' && body.managerId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['managerId'],
          message: 'a manager cannot have a manager',
        });
      }
    }),
};

const password = z.string().min(MIN_PASSWORD_LENGTH).max(128);

export const updateUserSchemas = {
  params: userIdParamsSchema,
  body: z
    .strictObject({
      name: z.string().trim().min(1).max(120).optional(),
      role: z.enum(CREATABLE_ROLES).optional(),
      managerId: z.uuid().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'provide at least one field to update'),
};

export const resetPasswordSchemas = {
  params: userIdParamsSchema,
  body: z.strictObject({ password }),
};

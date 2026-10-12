import { z } from 'zod';
import { isoDate, queryBoolean, uuid } from './common.js';

const code = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/, 'letters, digits, . _ - only');
const name = z.string().trim().min(1).max(120);
const budgetHours = z.number().min(0).max(10_000_000).multipleOf(0.01);

export const listProjectsSchemas = {
  query: z.object({ includeArchived: queryBoolean.optional() }),
};
export const projectIdSchemas = { params: z.object({ id: uuid }) };

export const createProjectSchemas = {
  body: z.strictObject({
    code,
    name,
    clientName: name.optional(),
    budgetHours,
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  }),
};

export const updateProjectSchemas = {
  params: z.object({ id: uuid }),
  body: z
    .strictObject({
      code: code.optional(),
      name: name.optional(),
      clientName: name.nullable().optional(),
      budgetHours: budgetHours.optional(),
      startDate: isoDate.nullable().optional(),
      endDate: isoDate.nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'provide at least one field to update'),
};

export const createTaskSchemas = {
  params: z.object({ id: uuid }),
  body: z.strictObject({ name }),
};

export const updateTaskSchemas = {
  params: z.object({ id: uuid, taskId: uuid }),
  body: z
    .strictObject({ name: name.optional(), isActive: z.boolean().optional() })
    .refine((body) => Object.keys(body).length > 0, 'provide at least one field to update'),
};

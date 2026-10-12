import { z } from 'zod';
import { daysBetween } from '../utils/dates.js';
import { bothDates, isoDate, mondayDate, uuid } from './common.js';

// Hours: positive, at most 24 per entry, in quarter-hour steps (assumption; see requirements.md).
const hours = z.number().positive().max(24).multipleOf(0.25);
const notes = z.string().trim().max(1000);

export const entryIdSchemas = { params: z.object({ id: uuid }) };

export const createEntrySchemas = {
  body: z.strictObject({
    projectId: uuid,
    taskId: uuid,
    workDate: isoDate,
    hours,
    isBillable: z.boolean(),
    notes: notes.optional(),
  }),
};

export const updateEntrySchemas = {
  params: z.object({ id: uuid }),
  body: z
    .strictObject({
      projectId: uuid.optional(),
      taskId: uuid.optional(),
      workDate: isoDate.optional(),
      hours: hours.optional(),
      isBillable: z.boolean().optional(),
      notes: notes.nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'provide at least one field to update')
    .refine((body) => body.projectId === undefined || body.taskId !== undefined, {
      message: 'taskId is required when projectId changes',
      path: ['taskId'],
    }),
};

export const listEntriesSchemas = {
  query: z
    .object({ from: isoDate, to: isoDate, projectId: uuid.optional(), userId: uuid.optional() })
    .refine((q) => !bothDates(q) || q.from <= q.to, {
      message: 'from must not be after to',
      path: ['from'],
    })
    .refine((q) => !bothDates(q) || daysBetween(q.from, q.to) <= 366, {
      message: 'date range must not exceed 366 days',
      path: ['to'],
    }),
};

export const weekSchemas = {
  params: z.object({ weekStart: mondayDate }),
  query: z.object({ userId: uuid.optional() }),
};

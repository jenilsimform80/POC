import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import * as entries from '../services/time-entry.service.js';
import { getWeek } from '../services/timesheet.service.js';
import type {
  createEntrySchemas,
  entryIdSchemas,
  listEntriesSchemas,
  updateEntrySchemas,
  weekSchemas,
} from '../validation/time-entries.schemas.js';

export function createTimeEntriesController(prisma: PrismaClient) {
  const create: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof createEntrySchemas>(res);
    res.status(201).json(await entries.createEntry(prisma, requireAuth(req), body));
  };

  const list: RequestHandler = async (req, res) => {
    const { query } = getValidated<typeof listEntriesSchemas>(res);
    res.status(200).json({ entries: await entries.listEntries(prisma, requireAuth(req), query) });
  };

  const get: RequestHandler = async (req, res) => {
    const { params } = getValidated<typeof entryIdSchemas>(res);
    res.status(200).json({ entry: await entries.getEntry(prisma, requireAuth(req), params.id) });
  };

  const update: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<typeof updateEntrySchemas>(res);
    res.status(200).json(await entries.updateEntry(prisma, requireAuth(req), params.id, body));
  };

  const remove: RequestHandler = async (req, res) => {
    const { params } = getValidated<typeof entryIdSchemas>(res);
    await entries.deleteEntry(prisma, requireAuth(req), params.id);
    res.status(204).end();
  };

  const week: RequestHandler = async (req, res) => {
    const { params, query } = getValidated<typeof weekSchemas>(res);
    res.status(200).json(await getWeek(prisma, requireAuth(req), params.weekStart, query.userId));
  };

  return { create, list, get, update, remove, week };
}

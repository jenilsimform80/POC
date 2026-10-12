import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import * as submissions from '../services/submission.service.js';
import type {
  approveSchemas,
  listSubmissionsSchemas,
  rejectSchemas,
  submissionIdSchemas,
  submitWeekSchemas,
} from '../validation/submissions.schemas.js';

export function createSubmissionsController(prisma: PrismaClient) {
  const submit: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof submitWeekSchemas>(res);
    res
      .status(201)
      .json({ submission: await submissions.submitWeek(prisma, requireAuth(req), body.weekStart) });
  };

  const list: RequestHandler = async (req, res) => {
    const { query } = getValidated<typeof listSubmissionsSchemas>(res);
    res
      .status(200)
      .json({ submissions: await submissions.listSubmissions(prisma, requireAuth(req), query) });
  };

  const get: RequestHandler = async (req, res) => {
    const { params } = getValidated<typeof submissionIdSchemas>(res);
    res
      .status(200)
      .json({ submission: await submissions.getSubmission(prisma, requireAuth(req), params.id) });
  };

  const approve: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<typeof approveSchemas>(res);
    const submission = await submissions.decideSubmission(
      prisma,
      requireAuth(req),
      params.id,
      'APPROVED',
      body?.comment,
    );
    res.status(200).json({ submission });
  };

  const reject: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<typeof rejectSchemas>(res);
    const submission = await submissions.decideSubmission(
      prisma,
      requireAuth(req),
      params.id,
      'REJECTED',
      body.comment,
    );
    res.status(200).json({ submission });
  };

  return { submit, list, get, approve, reject };
}

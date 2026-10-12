import { visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { addDays, toIsoDate } from '../utils/dates.js';
import { toEntryView } from './time-entry.service.js';
import { evaluateWarnings, type TimesheetWarning } from './timesheet-rules.js';

/** One user's week: entries, per-day and weekly totals, warnings and submission status. */
export async function getWeek(
  prisma: PrismaClient,
  actor: AuthUser,
  weekStart: Date,
  userId?: string,
) {
  const targetUserId = userId ?? actor.id;
  if (targetUserId !== actor.id) {
    const visible = await prisma.user.findFirst({
      where: { AND: [{ id: targetUserId }, visibleUsersWhere(actor)] },
      select: { id: true },
    });
    if (!visible) throw new AppError('NOT_FOUND', 404, 'User not found');
  }

  const weekEnd = addDays(weekStart, 6);
  const [entries, submission] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: targetUserId, workDate: { gte: weekStart, lte: weekEnd } },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.weeklySubmission.findUnique({
      where: { userId_weekStart: { userId: targetUserId, weekStart } },
      select: { id: true, status: true, submittedAt: true },
    }),
  ]);

  const dailyTotals: Record<string, number> = {};
  let weeklyTotal = 0;
  let billableTotal = 0;
  for (const entry of entries) {
    const hours = Number(entry.hours);
    const day = toIsoDate(entry.workDate);
    dailyTotals[day] = (dailyTotals[day] ?? 0) + hours;
    weeklyTotal += hours;
    if (entry.isBillable) billableTotal += hours;
  }

  const warnings: TimesheetWarning[] = [];
  for (const [date, dayTotal] of Object.entries(dailyTotals)) {
    warnings.push(...evaluateWarnings({ date, dayTotal, weekTotal: 0 }));
  }
  warnings.push(...evaluateWarnings({ date: '', dayTotal: 0, weekTotal: weeklyTotal }));

  return {
    userId: targetUserId,
    weekStart: toIsoDate(weekStart),
    weekEnd: toIsoDate(weekEnd),
    status: submission?.status ?? 'DRAFT',
    submission: submission && {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
    },
    entries: entries.map(toEntryView),
    dailyTotals,
    weeklyTotal,
    billableTotal,
    nonBillableTotal: weeklyTotal - billableTotal,
    warnings,
  };
}

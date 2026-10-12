import type { WeekStatus } from '../../api/types';
import { Badge, type Tone } from './Badge';

const WEEK_STATUS: Record<WeekStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export function StatusBadge({ status }: { status: WeekStatus }) {
  const { label, tone } = WEEK_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

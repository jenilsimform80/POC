import { addDays, formatRange, mondayOf, todayIso } from '../../lib/dates';
import { Button } from '../../components/ui/Button';
import styles from './Timesheet.module.css';

interface WeekNavigatorProps {
  weekStart: string;
  weekEnd: string;
  onChange: (weekStart: string) => void;
}

export function WeekNavigator({ weekStart, weekEnd, onChange }: WeekNavigatorProps) {
  const thisWeek = mondayOf(todayIso());
  return (
    <div className={styles.weekNav} role="group" aria-label="Choose week">
      <Button
        variant="secondary"
        onClick={() => onChange(addDays(weekStart, -7))}
        aria-label="Previous week"
      >
        ‹ Previous
      </Button>
      <strong aria-live="polite">{formatRange(weekStart, weekEnd)}</strong>
      <Button
        variant="secondary"
        onClick={() => onChange(addDays(weekStart, 7))}
        aria-label="Next week"
      >
        Next ›
      </Button>
      <Button
        variant="secondary"
        disabled={weekStart === thisWeek}
        onClick={() => onChange(thisWeek)}
      >
        This week
      </Button>
    </div>
  );
}

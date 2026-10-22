import { useState } from 'react';
import type { EntryInput, EntryPatch } from '../../api/timesheets';
import type { Project, TimeEntry } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { formatDay, todayIso } from '../../lib/dates';
import { EntryForm } from './EntryForm';
import type { ProjectLookup } from './projectLookup';
import styles from './Timesheet.module.css';

interface DaySectionProps {
  date: string;
  entries: TimeEntry[];
  total: number;
  lookup: ProjectLookup;
  /** Active projects for the form; omit for a read-only view (manager review). */
  projects?: Project[];
  weekStart?: string;
  weekEnd?: string;
  /** Why this day cannot be edited (frozen week / locked month); undefined when it can. */
  lockedReason?: string | undefined;
  /** These reject on failure; this component shows the reason and keeps the UI open. */
  onCreate?: (value: EntryInput) => Promise<unknown>;
  onUpdate?: (id: string, patch: EntryPatch) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
}

export function DaySection({
  date,
  entries,
  total,
  lookup,
  projects,
  weekStart,
  weekEnd,
  lockedReason,
  onCreate,
  onUpdate,
  onDelete,
}: DaySectionProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const remove = useMutation(async (id: string) => {
    await onDelete?.(id);
    setConfirmingId(null);
  });
  const editable = Boolean(projects && weekStart && weekEnd && onCreate && onUpdate && onDelete);
  const canEdit = editable && !lockedReason;
  const headingId = `day-${date}`;
  const isToday = date === todayIso();
  const isWeekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const sectionClass = [styles.day, isToday && styles.today, isWeekend && styles.weekend]
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby={headingId} className={sectionClass}>
      <header className={styles.dayHeader}>
        <h3 id={headingId}>
          {formatDay(date)}
          {isToday && <Badge tone="info">Today</Badge>}
        </h3>
        <span
          className={total > 0 ? styles.dayTotal : `${styles.dayTotal} ${styles.dayTotalEmpty}`}
        >
          {total > 0 ? `${total} h` : '—'}
        </span>
      </header>

      {entries.length === 0 && !adding && (
        <p className={`muted ${styles.dayEmpty}`}>No time logged.</p>
      )}

      <ul className={styles.entries}>
        {entries.map((entry) =>
          editingId === entry.id && canEdit && projects && weekStart && weekEnd && onUpdate ? (
            <li key={entry.id}>
              <EntryForm
                projects={projects}
                minDate={weekStart}
                maxDate={weekEnd}
                defaultDate={date}
                entry={entry}
                onSave={(value) => onUpdate(entry.id, value)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={entry.id} className={styles.entry}>
              <div>
                <strong>{lookup.projectLabel(entry.projectId)}</strong>
                <span className="muted"> · {lookup.taskName(entry.projectId, entry.taskId)}</span>
                {entry.notes && <p className={styles.notes}>{entry.notes}</p>}
              </div>
              <div className={styles.entryMeta}>
                <span className={styles.entryHours}>{entry.hours} h</span>
                <Badge tone={entry.isBillable ? 'success' : 'neutral'}>
                  {entry.isBillable ? 'Billable' : 'Non-billable'}
                </Badge>
                {canEdit && confirmingId !== entry.id && (
                  <>
                    <Button
                      variant="secondary"
                      className={styles.small}
                      onClick={() => setEditingId(entry.id)}
                      aria-label={`Edit entry ${lookup.projectLabel(entry.projectId)}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      className={styles.small}
                      onClick={() => setConfirmingId(entry.id)}
                      aria-label={`Delete entry ${lookup.projectLabel(entry.projectId)}`}
                    >
                      Delete
                    </Button>
                  </>
                )}
                {canEdit && confirmingId === entry.id && (
                  <span role="group" aria-label="Confirm delete" className={styles.confirm}>
                    Delete this entry?
                    <Button onClick={() => void remove.run(entry.id)} disabled={remove.running}>
                      {remove.running ? 'Deleting…' : 'Yes, delete'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmingId(null)}
                      disabled={remove.running}
                    >
                      Keep
                    </Button>
                  </span>
                )}
              </div>
              {remove.error && confirmingId === entry.id && (
                <Alert variant="error">{describeError(remove.error)}</Alert>
              )}
            </li>
          ),
        )}
      </ul>

      {adding && canEdit && projects && weekStart && weekEnd && onCreate && (
        <EntryForm
          projects={projects}
          minDate={weekStart}
          maxDate={weekEnd}
          defaultDate={date}
          onSave={(value) => onCreate(value as EntryInput)}
          onCancel={() => setAdding(false)}
        />
      )}

      {editable && !adding && (
        <>
          {lockedReason ? (
            <p className="muted">{lockedReason}</p>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              aria-label={`Add entry on ${formatDay(date)}`}
            >
              + Add entry
            </Button>
          )}
        </>
      )}
    </section>
  );
}

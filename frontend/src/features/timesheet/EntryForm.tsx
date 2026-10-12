import { useState, type FormEvent } from 'react';
import type { EntryInput, EntryPatch } from '../../api/timesheets';
import type { Project, TimeEntry } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom } from '../../lib/forms';
import styles from './Timesheet.module.css';

interface EntryFormProps {
  projects: Project[];
  /** First and last day the date input accepts (the week being shown). */
  minDate: string;
  maxDate: string;
  /** Pre-filled date for a new entry, or the entry being edited. */
  defaultDate: string;
  entry?: TimeEntry;
  /** Must reject on failure: the form shows the error and stays open. */
  onSave: (value: EntryInput | EntryPatch) => Promise<unknown>;
  onCancel: () => void;
}

type Errors = Partial<Record<'projectId' | 'taskId' | 'workDate' | 'hours' | 'notes', string>>;

const isQuarterHour = (n: number) => Number.isInteger(n * 4);

export function EntryForm({
  projects,
  minDate,
  maxDate,
  defaultDate,
  entry,
  onSave,
  onCancel,
}: EntryFormProps) {
  const [projectId, setProjectId] = useState(entry?.projectId ?? '');
  const [taskId, setTaskId] = useState(entry?.taskId ?? '');
  const [workDate, setWorkDate] = useState(entry?.workDate ?? defaultDate);
  const [hours, setHours] = useState(entry ? String(entry.hours) : '');
  const [isBillable, setIsBillable] = useState(entry?.isBillable ?? true);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [clientErrors, setClientErrors] = useState<Errors>({});
  const save = useMutation(onSave);

  // An entry on a project that has since been archived is not in the active list; keep it
  // selectable so the user can still correct hours/notes without being forced to change project.
  const knownProject = projects.some((p) => p.id === projectId);
  const tasks = projects.find((p) => p.id === projectId)?.tasks ?? [];
  const serverErrors = fieldErrorsFrom(save.error);
  const errors: Errors = { ...serverErrors, ...clientErrors };
  const hasFieldErrors = Object.keys(serverErrors).length > 0;

  const validate = (): Errors => {
    const found: Errors = {};
    if (!projectId) found.projectId = 'Choose a project';
    if (!taskId) found.taskId = 'Choose a task';
    if (!workDate || workDate < minDate || workDate > maxDate)
      found.workDate = 'Pick a day in this week';
    const parsed = Number(hours);
    if (
      hours.trim() === '' ||
      Number.isNaN(parsed) ||
      parsed <= 0 ||
      parsed > 24 ||
      !isQuarterHour(parsed)
    ) {
      found.hours = 'Enter hours in steps of 0.25, from 0.25 up to 24';
    }
    return found;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    const parsedHours = Number(hours);
    const trimmedNotes = notes.trim();
    let value: EntryInput | EntryPatch;
    if (!entry) {
      value = {
        projectId,
        taskId,
        workDate,
        hours: parsedHours,
        isBillable,
        ...(trimmedNotes && { notes: trimmedNotes }),
      };
    } else {
      // Send only what changed; the backend requires taskId whenever projectId changes.
      const patch: EntryPatch = {};
      if (projectId !== entry.projectId || taskId !== entry.taskId) {
        patch.projectId = projectId;
        patch.taskId = taskId;
      }
      if (workDate !== entry.workDate) patch.workDate = workDate;
      if (parsedHours !== entry.hours) patch.hours = parsedHours;
      if (isBillable !== entry.isBillable) patch.isBillable = isBillable;
      if (trimmedNotes !== (entry.notes ?? ''))
        patch.notes = trimmedNotes === '' ? null : trimmedNotes;
      if (Object.keys(patch).length === 0) {
        onCancel(); // nothing changed
        return;
      }
      value = patch;
    }
    const result = await save.run(value);
    if (result.ok) onCancel();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className={styles.entryForm}
      aria-label={entry ? 'Edit time entry' : 'Add time entry'}
    >
      {save.error && !hasFieldErrors && <Alert variant="error">{describeError(save.error)}</Alert>}
      <div className="row">
        <SelectField
          label="Project"
          value={projectId}
          error={errors.projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setTaskId('');
          }}
        >
          <option value="">Select a project…</option>
          {!knownProject && projectId && <option value={projectId}>Archived project</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Task"
          value={taskId}
          error={errors.taskId}
          onChange={(e) => setTaskId(e.target.value)}
        >
          <option value="">Select a task…</option>
          {!tasks.some((t) => t.id === taskId) && taskId && (
            <option value={taskId}>Archived task</option>
          )}
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Date"
          type="date"
          min={minDate}
          max={maxDate}
          value={workDate}
          error={errors.workDate}
          onChange={(e) => setWorkDate(e.target.value)}
        />
        <TextField
          label="Hours"
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.25"
          max="24"
          value={hours}
          error={errors.hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      <TextAreaField
        label="Notes (optional)"
        rows={2}
        maxLength={1000}
        value={notes}
        error={errors.notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <CheckboxField
        label="Billable"
        checked={isBillable}
        onChange={(e) => setIsBillable(e.target.checked)}
      />
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

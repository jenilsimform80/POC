import { useState, type FormEvent } from 'react';
import type { ProjectInput, ProjectPatch } from '../../api/projects';
import type { Project, User } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { CheckboxField, TextField } from '../../components/ui/FormControls';
import { describeError } from '../../components/ui/describeError';
import { useMutation } from '../../hooks/useMutation';
import { fieldErrorsFrom } from '../../lib/forms';
import { PersonChecklist } from './PersonChecklist';

interface ProjectFormProps {
  project?: Project;
  /** Active contributors and managers who can be made members of a restricted project. */
  people: User[];
  /** Must reject on failure; the form shows why and stays open. */
  onSave: (value: ProjectInput | ProjectPatch) => Promise<unknown>;
  onCancel: () => void;
}

type Field = 'code' | 'name' | 'clientName' | 'budgetHours' | 'startDate' | 'endDate';

export function ProjectForm({ project, people, onSave, onCancel }: ProjectFormProps) {
  const [code, setCode] = useState(project?.code ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [clientName, setClientName] = useState(project?.clientName ?? '');
  const [budget, setBudget] = useState(
    project?.budgetHours !== undefined ? String(project.budgetHours) : '',
  );
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [endDate, setEndDate] = useState(project?.endDate ?? '');
  const [isRestricted, setIsRestricted] = useState(project?.isRestricted ?? false);
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? []);
  const [clientErrors, setClientErrors] = useState<Partial<Record<Field, string>>>({});
  const save = useMutation(onSave);

  const serverErrors = fieldErrorsFrom(save.error);
  const errors = { ...serverErrors, ...clientErrors } as Partial<Record<Field, string>>;

  const validate = () => {
    const found: Partial<Record<Field, string>> = {};
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(code.trim()))
      found.code = 'Use 1–32 letters, digits, dots, dashes or underscores';
    if (name.trim() === '') found.name = 'Enter a project name';
    const parsed = Number(budget);
    if (budget.trim() === '' || Number.isNaN(parsed) || parsed < 0)
      found.budgetHours = 'Enter the budget in hours (0 or more)';
    if (startDate && endDate && endDate < startDate)
      found.endDate = 'The end date cannot be before the start date';
    return found;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    const budgetHours = Number(budget);
    let value: ProjectInput | ProjectPatch;
    if (!project) {
      value = {
        code: code.trim(),
        name: name.trim(),
        budgetHours,
        ...(clientName.trim() && { clientName: clientName.trim() }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(isRestricted && { isRestricted, memberIds }),
      };
    } else {
      // Only what changed; optional fields cleared by the user become null.
      const patch: ProjectPatch = {};
      if (code.trim() !== project.code) patch.code = code.trim();
      if (name.trim() !== project.name) patch.name = name.trim();
      if (clientName.trim() !== (project.clientName ?? ''))
        patch.clientName = clientName.trim() || null;
      if (budgetHours !== project.budgetHours) patch.budgetHours = budgetHours;
      if (startDate !== (project.startDate ?? '')) patch.startDate = startDate || null;
      if (endDate !== (project.endDate ?? '')) patch.endDate = endDate || null;
      if (isRestricted !== project.isRestricted) patch.isRestricted = isRestricted;
      const before = [...(project.memberIds ?? [])].sort().join();
      if (isRestricted && [...memberIds].sort().join() !== before) patch.memberIds = memberIds;
      // Opening a project to everyone again clears its member list.
      if (!isRestricted && project.isRestricted) patch.memberIds = [];
      if (Object.keys(patch).length === 0) {
        onCancel();
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
      aria-label={project ? 'Edit project' : 'New project'}
      className="stack"
    >
      {save.error && Object.keys(serverErrors).length === 0 && (
        <Alert variant="error">{describeError(save.error)}</Alert>
      )}
      <div className="row">
        <TextField
          label="Code"
          value={code}
          error={errors.code}
          onChange={(e) => setCode(e.target.value)}
        />
        <TextField
          label="Name"
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Client (optional)"
          value={clientName}
          error={errors.clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
      </div>
      <div className="row">
        <TextField
          label="Budget (hours)"
          type="number"
          step="0.01"
          min="0"
          value={budget}
          error={errors.budgetHours}
          onChange={(e) => setBudget(e.target.value)}
        />
        <TextField
          label="Start date (optional)"
          type="date"
          value={startDate}
          error={errors.startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <TextField
          label="End date (optional)"
          type="date"
          value={endDate}
          error={errors.endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <CheckboxField
        label="Restrict to selected people (otherwise every signed-in user can log time here)"
        checked={isRestricted}
        onChange={(e) => setIsRestricted(e.target.checked)}
      />
      {isRestricted && (
        <PersonChecklist
          legend="Members"
          people={people}
          selected={memberIds}
          onChange={setMemberIds}
        />
      )}
      <div className="row">
        <Button type="submit" disabled={save.running}>
          {save.running ? 'Saving…' : project ? 'Save project' : 'Create project'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={save.running}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

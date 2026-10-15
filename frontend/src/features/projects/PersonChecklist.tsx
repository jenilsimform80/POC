import type { User } from '../../api/types';
import { CheckboxField } from '../../components/ui/FormControls';
import styles from './Projects.module.css';

interface PersonChecklistProps {
  legend: string;
  people: User[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** A plain checkbox list: choose any number of people. */
export function PersonChecklist({ legend, people, selected, onChange }: PersonChecklistProps) {
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((s) => s !== id));
  return (
    <fieldset className={styles.checklist}>
      <legend>{legend}</legend>
      {people.length === 0 && <p className="muted">No one to choose from.</p>}
      {people.map((p) => (
        <CheckboxField
          key={p.id}
          label={`${p.name} (${p.email})`}
          checked={selected.includes(p.id)}
          onChange={(e) => toggle(p.id, e.target.checked)}
        />
      ))}
    </fieldset>
  );
}

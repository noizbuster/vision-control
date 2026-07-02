import type { ClassEntry } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface ClassListProps {
  readonly classes: readonly ClassEntry[];
}

export function ClassList({ classes }: ClassListProps): ReactElement {
  if (classes.length === 0) {
    return <p className="inspector-text-preview">No classes.</p>;
  }

  return (
    <ul className="inspector-class-list" aria-label="Element classes">
      {classes.map((entry) => (
        <li key={entry.name} className="inspector-class-chip">
          <span>{entry.name}</span>
          <span className="inspector-class-chip__source">{entry.source}</span>
        </li>
      ))}
    </ul>
  );
}

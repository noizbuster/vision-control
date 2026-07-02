import type { AttributeEntry } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface AttributesProps {
  readonly attributes: readonly AttributeEntry[];
}

export function Attributes({ attributes }: AttributesProps): ReactElement {
  if (attributes.length === 0) {
    return <p className="inspector-text-preview">No safe attributes.</p>;
  }

  return (
    <dl className="inspector-attribute-list">
      {attributes.map((entry) => (
        <div key={entry.name} className="inspector-attribute-list__row">
          <dt className="inspector-attribute-list__name">{entry.name}</dt>
          <dd className="inspector-attribute-list__value">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

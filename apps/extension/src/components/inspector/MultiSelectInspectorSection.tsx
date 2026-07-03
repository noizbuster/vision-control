import type { ConstraintViolation, MultiSelectGroup } from "@vision-control/editor-core";
import type { ReactElement } from "react";

interface MultiSelectInspectorSectionProps {
  readonly group: MultiSelectGroup;
  readonly violations?: readonly ConstraintViolation[];
}

function row(label: string, value: string): ReactElement {
  return (
    <div className="inspector-semantic__row">
      <span className="inspector-semantic__label">{label}</span>
      <span className="inspector-semantic__value">{value}</span>
    </div>
  );
}

export function MultiSelectInspectorSection({
  group,
  violations = [],
}: MultiSelectInspectorSectionProps): ReactElement {
  const { x, y, width, height } = group.boundingRect;
  const parent = group.commonParent;
  return (
    <div className="inspector-multi-select">
      <div className="inspector-semantic">
        {row("Group id", group.id)}
        {row("Members", String(group.members.length))}
        {row("Frame", `${group.frameKind} (${group.frameId})`)}
        {row("Shadow", group.shadowRootCompatible ? group.shadowKind : "incompatible")}
        {row(
          "Bounding rect",
          `${Math.round(x)}, ${Math.round(y)} — ${Math.round(width)} × ${Math.round(height)}`,
        )}
        {row(
          "Common parent",
          parent === null
            ? "none (no shared ancestor)"
            : `${parent.tagName}${parent.selector !== undefined ? ` (${parent.selector})` : ""}`,
        )}
      </div>
      {violations.length > 0 && (
        <ul className="inspector-multi-select__violations">
          {violations.map((v) => (
            <li key={v.code} className="inspector-multi-select__violation">
              <strong>{v.code}</strong>: {v.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

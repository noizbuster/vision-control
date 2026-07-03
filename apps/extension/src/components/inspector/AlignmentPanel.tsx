import { type AlignmentCommandKind, commandLabel } from "@vision-control/layout-engine";
import type { ReactElement } from "react";

/**
 * Alignment / distribution command panel (PRD section 9.7 / VC-0610 /
 * VC-0615).
 *
 * Purely presentational: renders one button per alignment/distribution command.
 * The command is resolved to semantic source intent (parent layout property or
 * child alignment intent, never a pixel transform) by the layout-engine
 * resolver — this component only emits the user's chosen command kind.
 *
 * Registered into the inspector via an optional slot prop on
 * {@link InspectorPanel}, so it is additive and does not alter existing
 * sections.
 */

/** All ten alignment/distribution commands, in panel display order. */
const COMMANDS: readonly AlignmentCommandKind[] = [
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
  "equal-gap",
  "match-size",
];

export interface AlignmentPanelProps {
  /** Number of currently selected members; commands need at least 2. */
  readonly memberCount: number;
  /** Invoked with the chosen command kind. */
  readonly onCommand?: (command: AlignmentCommandKind) => void;
}

export function AlignmentPanel({ memberCount, onCommand }: AlignmentPanelProps): ReactElement {
  const disabled = memberCount < 2;
  return (
    <div className="alignment-panel" data-vc-alignment-panel>
      {disabled && <p className="alignment-panel__hint">Select at least two elements to align.</p>}
      <div className="alignment-panel__grid">
        {COMMANDS.map((command) => (
          <button
            key={command}
            type="button"
            className="alignment-panel__button"
            data-vc-alignment-command={command}
            disabled={disabled}
            onClick={() => onCommand?.(command)}
          >
            {commandLabel(command)}
          </button>
        ))}
      </div>
    </div>
  );
}

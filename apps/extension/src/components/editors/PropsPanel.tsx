import type { SetAttributeOperation, SetComponentPropOperation } from "@vision-control/change-ir";
import {
  createSetAttributeCommand,
  createSetComponentPropCommand,
  type SelectionSummary,
} from "@vision-control/inspector-core";
import type { BoundaryKind, OwnershipContext } from "@vision-control/source-resolver";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import type { ComponentPropEntry, PropFlowWarningEntry } from "../../messaging/index.js";

/**
 * Local mirror of `@vision-control/source-resolver`'s `propFlowWarnings`
 * cross-boundary blocking message. Inlined here so the panel (platform:browser)
 * does not VALUE-import the node-tagged source-resolver package (caught by the
 * symmetric `browser-imports-node` boundary rule). The canonical logic lives in
 * `packages/source-resolver/src/component-props/prop-flow-warnings.ts`; keep
 * these in sync until the logic relocates to an isomorphic package.
 */
const boundaryLabel = (boundary: BoundaryKind | undefined): string => {
  switch (boundary) {
    case "server-to-client":
      return "Server → Client";
    case "client-to-server":
      return "Client → Server";
    case "context-provider":
      return "Context Provider";
    default:
      return "framework";
  }
};

const crossBoundaryBlockReason = (
  componentName: string,
  propName: string,
  boundary: BoundaryKind | undefined,
): string =>
  `Component "${componentName}" prop "${propName}" crosses a ${boundaryLabel(boundary)} boundary without explicit opt-in; a deterministic suggestion is blocked — agent reasoning required`;

/** The source-range shape carried by a set-component-prop operation. */
type ComponentPropSourceRange = SetComponentPropOperation["sourceRange"];

/** Command emitted by the props panel: a DOM-attribute set or a component-prop set. */
export type PropEditCommand = SetAttributeOperation | SetComponentPropOperation;

/** Whether a prop is a DOM attribute or a component-level prop. */
export type EditablePropKind = "dom-attribute" | "component-prop";

/**
 * One editable prop on the selected element. The caller (App.tsx via
 * `useComponentProps`) populates this from daemon-side prop discovery; the
 * panel classifies and emits the matching operation kind. Structurally
 * compatible with the wire {@link ComponentPropEntry} shape.
 */
export interface EditableProp {
  readonly name: string;
  readonly value: string;
  readonly kind: EditablePropKind;
  /** Owning component name. Required for `component-prop` (names the JSX tag). */
  readonly componentName?: string;
  /** Resolved JSX source range. Required for `component-prop`. */
  readonly sourceRange?: ComponentPropSourceRange;
  /** Ownership context for cross-boundary detection. */
  readonly ownershipContext?: OwnershipContext;
  /** Boundary kind when the prop crosses a framework/server/client boundary. */
  readonly boundary?: BoundaryKind;
  /**
   * Daemon-computed prop-flow warnings (full `propFlowWarnings` semantics).
   * When present, the panel blocks on any `severity: "error"` entry instead of
   * the inline cross-boundary predicate, so future warning additions are
   * honoured without a panel change.
   */
  readonly warnings?: readonly PropFlowWarningEntry[];
}

interface PropsPanelProps {
  readonly summary: SelectionSummary;
  readonly props: readonly EditableProp[];
  readonly onCommand: (command: PropEditCommand) => void;
  readonly onValidationError?: (error: string | null) => void;
}

interface PropRowProps {
  readonly prop: EditableProp;
  readonly target: SelectionSummary["identity"];
  readonly onCommand: PropsPanelProps["onCommand"];
  readonly onValidationError?: PropsPanelProps["onValidationError"];
}

/**
 * Classify a prop and build the matching command, or return a blocking reason.
 * Cross-boundary component-prop edits without opt-in are blocked here (PRD §7.2).
 *
 * Blocking decision: when daemon-computed `warnings` are present, blocks on any
 * `severity: "error"` entry (full `propFlowWarnings` semantics). This is
 * forward-compatible — a future warning addition blocks without a panel change.
 * Falls back to the inline `cross-boundary` predicate when no daemon warnings
 * accompany the prop (backward compat, test isolation).
 */
const buildPropCommand = (
  prop: EditableProp,
  nextValue: string,
  target: SelectionSummary["identity"],
  boundaryOptIn: boolean,
): { command: PropEditCommand } | { reason: string } => {
  const elementRef = { runtimeId: target.runtimeId, selector: target.selector ?? undefined };

  if (prop.kind === "dom-attribute") {
    return {
      command: createSetAttributeCommand(elementRef, prop.name, nextValue, prop.value),
    };
  }

  if (prop.componentName === undefined) {
    return { reason: `component-prop "${prop.name}" is missing its componentName` };
  }
  if (prop.sourceRange === undefined) {
    return { reason: `component-prop "${prop.name}" has no resolved source range` };
  }

  const blockReason = computeBlockReason(prop, boundaryOptIn);
  if (blockReason !== null) {
    return { reason: blockReason };
  }

  return {
    command: createSetComponentPropCommand(
      elementRef,
      prop.componentName,
      prop.name,
      nextValue,
      prop.value,
      prop.sourceRange,
    ),
  };
};

const CROSS_BOUNDARY_NO_OPT_IN_CODE = "prop-flow-cross-boundary-no-opt-in";

const computeBlockReason = (prop: EditableProp, boundaryOptIn: boolean): string | null => {
  const warnings = prop.warnings;
  if (warnings !== undefined && warnings.length > 0) {
    const errorWarnings = warnings.filter((w) => w.severity === "error");
    if (errorWarnings.length === 0) {
      return null;
    }
    if (boundaryOptIn) {
      const surviving = errorWarnings.find((w) => w.code !== CROSS_BOUNDARY_NO_OPT_IN_CODE);
      return surviving?.message ?? null;
    }
    return errorWarnings[0]?.message ?? null;
  }

  if (prop.ownershipContext === "cross-boundary" && !boundaryOptIn) {
    return crossBoundaryBlockReason(prop.componentName ?? "unknown", prop.name, prop.boundary);
  }
  return null;
};

function PropRow({ prop, target, onCommand, onValidationError }: PropRowProps): ReactElement {
  const [draft, setDraft] = useState(prop.value);
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCrossBoundary =
    prop.ownershipContext === "cross-boundary" ||
    (prop.warnings?.some((w) => w.code.startsWith("prop-flow-cross-boundary")) ?? false);

  const commit = useCallback((): void => {
    const trimmed = draft.trim();
    onValidationError?.(null);
    if (trimmed === prop.value) {
      setError(null);
      return;
    }
    const result = buildPropCommand(prop, trimmed, target, optIn);
    if ("reason" in result) {
      setError(result.reason);
      onValidationError?.(result.reason);
      return;
    }
    setError(null);
    onCommand(result.command);
  }, [draft, prop, target, optIn, onCommand, onValidationError]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  const label = prop.kind === "component-prop" ? `${prop.componentName}.${prop.name}` : prop.name;

  return (
    <li className="props-panel__row">
      <span className="props-panel__prop-name">{label}</span>
      <input
        type="text"
        className={`props-panel__input ${error !== null ? "props-panel__input--error" : ""}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-invalid={error !== null}
        aria-label={`Edit ${label}`}
      />
      {isCrossBoundary && (
        <label className="props-panel__opt-in">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(event) => setOptIn(event.target.checked)}
          />
          cross-boundary opt-in
        </label>
      )}
      {error !== null && <span className="props-panel__error">{error}</span>}
    </li>
  );
}

export function PropsPanel({
  summary,
  props,
  onCommand,
  onValidationError,
}: PropsPanelProps): ReactElement {
  if (props.length === 0) {
    return (
      <div className="props-panel">
        <p className="props-panel__empty">No editable props for this element.</p>
      </div>
    );
  }

  return (
    <div className="props-panel">
      <p className="props-panel__hint">
        Edit a prop and press Enter. Component props target source; DOM attributes target the
        element.
      </p>
      <ul className="props-panel__list">
        {props.map((prop) => (
          <PropRow
            key={`${prop.kind}:${prop.name}`}
            prop={prop}
            target={summary.identity}
            onCommand={onCommand}
            {...(onValidationError !== undefined ? { onValidationError } : {})}
          />
        ))}
      </ul>
    </div>
  );
}

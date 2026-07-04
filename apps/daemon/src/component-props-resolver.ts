/**
 * Daemon-side component-prop discovery endpoint (VC-V1V2-21 / task 5).
 *
 * `discoverProps` and `propFlowWarnings` live in `@vision-control/source-resolver`
 * (platform:node — reads `node:fs`). They MUST run in the daemon, never the
 * browser. This module is the daemon's bridge: given a selection identity that
 * resolves to a source marker, it reads the component source file, discovers
 * props, computes ownership risk + prop-flow warnings, and returns the wire
 * payload that the panel-bound `component-props` message carries.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SourceRegistry } from "@vision-control/source-registry";
import {
  type BoundaryKind,
  discoverProps,
  type OwnershipContext,
  type PropFlowWarning,
  type PropFlowWarningSeverity,
  propFlowWarnings,
} from "@vision-control/source-resolver";

/** Input for daemon-side component prop resolution. */
export interface ResolveComponentPropsInput {
  readonly elementId: string;
  readonly tagName: string;
  readonly sourceId?: string;
  readonly componentName?: string;
  /**
   * Ownership context for the resolved component. Defaults to `same-component`
   * (the marker points at the component's own source). A future marker-metadata
   * expansion can pass `reparented-or-moved` or `cross-boundary`.
   */
  readonly ownershipContext?: OwnershipContext;
  readonly boundary?: BoundaryKind;
}

/** Serializable prop-flow warning mirror (matches the panel-side type). */
export interface ResolvedPropFlowWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: PropFlowWarningSeverity;
  readonly context: OwnershipContext;
  readonly boundary: BoundaryKind;
}

/** One daemon-resolved editable prop with ownership warnings attached. */
export interface ResolvedComponentProp {
  readonly name: string;
  readonly value: string;
  readonly kind: "dom-attribute" | "component-prop";
  readonly componentName?: string;
  readonly sourceRange?: {
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
  };
  readonly ownershipContext?: OwnershipContext;
  readonly boundary?: BoundaryKind;
  readonly warnings?: readonly ResolvedPropFlowWarning[];
}

/** Wire result carrying the resolved props for one element. */
export interface ResolveComponentPropsResult {
  readonly elementId: string;
  readonly props: readonly ResolvedComponentProp[];
}

const toResolvedWarning = (w: PropFlowWarning): ResolvedPropFlowWarning => ({
  code: w.code,
  message: w.message,
  severity: w.severity,
  context: w.context,
  boundary: w.boundary,
});

/**
 * Resolve the editable component props for a selection by reading the source
 * file backing the element's marker, running `discoverProps`, and computing
 * `propFlowWarnings` for each discovered prop.
 *
 * Returns an empty props list when no marker is registered, no component name
 * is derivable, or the source file is unreadable — never throws.
 */
export const resolveComponentProps = (
  workspaceRoot: string,
  registry: SourceRegistry,
  input: ResolveComponentPropsInput,
): ResolveComponentPropsResult => {
  const sourceId = input.sourceId ?? input.elementId;
  const entry = registry.lookup(sourceId);
  if (entry === undefined) {
    return { elementId: input.elementId, props: [] };
  }

  const componentName = input.componentName ?? entry.componentName;
  if (componentName === undefined) {
    return { elementId: input.elementId, props: [] };
  }

  const filePath = join(workspaceRoot, entry.workspaceRelativePath);
  let sourceText: string;
  try {
    sourceText = readFileSync(filePath, "utf-8");
  } catch {
    return { elementId: input.elementId, props: [] };
  }

  const discovered = discoverProps({
    framework: "jsx",
    componentName,
    filePath: entry.workspaceRelativePath,
    sourceText,
    nearLine: entry.range.startLine + 1,
  });

  const ownershipContext: OwnershipContext = input.ownershipContext ?? "same-component";
  const boundary = input.boundary;

  const props: ResolvedComponentProp[] = discovered.props.map((dp) => {
    const value = dp.literalValue !== undefined ? String(dp.literalValue) : dp.rawValue;
    const sourceRange =
      dp.sourceRange !== undefined
        ? {
            startLine: dp.sourceRange.startLine,
            startColumn: dp.sourceRange.startColumn,
            endLine: dp.sourceRange.endLine,
            endColumn: dp.sourceRange.endColumn,
          }
        : undefined;

    const warnings = propFlowWarnings({
      componentName,
      propName: dp.name,
      context: ownershipContext,
      ...(boundary !== undefined ? { boundary } : {}),
    });

    return {
      name: dp.name,
      value,
      kind: "component-prop" as const,
      componentName,
      ...(sourceRange !== undefined ? { sourceRange } : {}),
      ownershipContext,
      ...(boundary !== undefined ? { boundary } : {}),
      ...(warnings.length > 0 ? { warnings: warnings.map(toResolvedWarning) } : {}),
    };
  });

  return { elementId: input.elementId, props };
};

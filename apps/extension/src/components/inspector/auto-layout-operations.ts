import type {
  OperationOrigin,
  SetChildSizingOperation,
  SetContainerLayoutOperation,
} from "@vision-control/change-ir";
import { createOperationId } from "@vision-control/change-ir";
import type { AutoLayoutCommand, AutoLayoutContainerContext } from "@vision-control/layout-engine";
import { isAutoLayoutSupported, resolveAutoLayoutCandidate } from "@vision-control/layout-engine";

export interface AutoLayoutElementRef {
  readonly runtimeId: string;
  readonly sourceId?: string;
  readonly selector?: string;
}

export interface BuildAutoLayoutOperationsInput {
  readonly command: AutoLayoutCommand;
  readonly container: AutoLayoutContainerContext;
  readonly containerRef: AutoLayoutElementRef;
  readonly childRef?: AutoLayoutElementRef;
  readonly origin: OperationOrigin;
  readonly previousValues?: Readonly<Record<string, string>>;
}

export type AutoLayoutOperation = SetContainerLayoutOperation | SetChildSizingOperation;

export type BuildAutoLayoutOperationsResult =
  | { readonly ok: true; readonly operations: readonly AutoLayoutOperation[] }
  | { readonly ok: false; readonly message: string };

const FLEX_GRID_DISPLAYS = new Set(["flex", "inline-flex", "grid", "inline-grid"]);

export function isFlexOrGridDisplay(display: string): boolean {
  return FLEX_GRID_DISPLAYS.has(display.trim().toLowerCase());
}

export function deriveAutoLayoutContainerContext(
  display: string,
  flexDirection: string,
): AutoLayoutContainerContext {
  const normalized = display.trim().toLowerCase();
  if (normalized === "flex" || normalized === "inline-flex") {
    return { layoutRole: "flex-container", display: normalized, flexDirection };
  }
  if (normalized === "grid" || normalized === "inline-grid") {
    return { layoutRole: "grid-container", display: normalized, flexDirection };
  }
  if (normalized === "inline" || normalized === "inline-block") {
    return { layoutRole: normalized, display: normalized, flexDirection };
  }
  if (normalized === "block" || normalized === "list-item" || normalized === "flow-root") {
    return { layoutRole: "normal-flow-block", display: normalized, flexDirection };
  }
  return { layoutRole: "unknown", display: normalized, flexDirection };
}

export function toElementRefFromIdentity(identity: {
  readonly runtimeId: string;
  readonly sourceId?: string | undefined;
  readonly selector?: string | undefined;
}): AutoLayoutElementRef {
  return {
    runtimeId: identity.runtimeId,
    ...(identity.sourceId !== undefined ? { sourceId: identity.sourceId } : {}),
    ...(identity.selector !== undefined ? { selector: identity.selector } : {}),
  };
}

function toChangeIrRef(ref: AutoLayoutElementRef): SetContainerLayoutOperation["container"] {
  return {
    runtimeId: ref.runtimeId,
    ...(ref.sourceId !== undefined ? { sourceId: ref.sourceId } : {}),
    ...(ref.selector !== undefined ? { selector: ref.selector } : {}),
  };
}

function singleContainerOp(
  input: BuildAutoLayoutOperationsInput,
  property: string,
  value: string,
): BuildAutoLayoutOperationsResult {
  const prev = input.previousValues?.[property];
  return {
    ok: true,
    operations: [
      {
        id: createOperationId(),
        kind: "set-container-layout",
        container: toChangeIrRef(input.containerRef),
        property,
        value,
        timestamp: Date.now(),
        runtime: false,
        origin: input.origin,
        confidence: 1,
        ...(prev !== undefined ? { previousValue: prev } : {}),
      },
    ],
  };
}

export function buildAutoLayoutOperations(
  input: BuildAutoLayoutOperationsInput,
): BuildAutoLayoutOperationsResult {
  const { command, container } = input;
  if (!isAutoLayoutSupported(container)) {
    return {
      ok: false,
      message: `Auto Layout is not available for this element (${container.layoutRole}). Select a flex or grid container.`,
    };
  }

  switch (command.kind) {
    case "set-direction":
      return singleContainerOp(input, "flex-direction", command.direction);
    case "set-gap": {
      if (command.value.trim() === "") return { ok: false, message: "Gap value is required." };
      const property =
        command.axis === "row" ? "row-gap" : command.axis === "column" ? "column-gap" : "gap";
      return singleContainerOp(input, property, command.value.trim());
    }
    case "set-align-main":
      return singleContainerOp(input, "justify-content", command.value);
    case "set-align-cross":
      return singleContainerOp(input, "align-items", command.value);
    case "set-wrap":
      return singleContainerOp(input, "flex-wrap", command.value);
    case "set-padding":
      return buildPaddingOperations(input);
    case "set-child-sizing":
      return buildChildSizingOperations(input);
    default: {
      const _exhaustive: never = command;
      return { ok: false, message: `Unknown Auto Layout command: ${JSON.stringify(_exhaustive)}` };
    }
  }
}

function buildPaddingOperations(
  input: BuildAutoLayoutOperationsInput,
): BuildAutoLayoutOperationsResult {
  const { command, container, containerRef, origin, previousValues } = input;
  if (command.kind !== "set-padding")
    return { ok: false, message: "Expected set-padding command." };
  if (command.mode !== "individual" && command.value.trim() === "") {
    return { ok: false, message: "Padding value is required." };
  }
  if (
    command.mode === "individual" &&
    (command.sides === undefined || Object.keys(command.sides).length === 0)
  ) {
    return { ok: false, message: "Individual padding requires at least one side value." };
  }

  const result = resolveAutoLayoutCandidate(command, container);
  if (!result.resolved) return { ok: false, message: result.diagnostic.message };

  const operations: SetContainerLayoutOperation[] = [];
  for (const candidate of result.candidates) {
    if (candidate.kind !== "container-layout") continue;
    const prev = previousValues?.[candidate.property];
    operations.push({
      id: createOperationId(),
      kind: "set-container-layout",
      container: toChangeIrRef(containerRef),
      property: candidate.property,
      value: candidate.value,
      timestamp: Date.now(),
      runtime: false,
      origin,
      confidence: 1,
      ...(prev !== undefined ? { previousValue: prev } : {}),
    });
  }
  if (operations.length === 0) return { ok: false, message: "No padding operations resolved." };
  return { ok: true, operations };
}

function buildChildSizingOperations(
  input: BuildAutoLayoutOperationsInput,
): BuildAutoLayoutOperationsResult {
  const { command, container, containerRef, childRef, origin, previousValues } = input;
  if (command.kind !== "set-child-sizing") {
    return { ok: false, message: "Expected set-child-sizing command." };
  }

  const result = resolveAutoLayoutCandidate(command, container);
  if (!result.resolved) return { ok: false, message: result.diagnostic.message };

  const sizingCandidate = result.candidates.find((c) => c.kind === "child-sizing");
  if (sizingCandidate === undefined || sizingCandidate.kind !== "child-sizing") {
    return { ok: false, message: "Child sizing could not be resolved." };
  }

  const declarations = sizingCandidate.declarations
    .map((d) => `${d.property}: ${d.value}`)
    .join("; ");
  const child = toChangeIrRef(childRef ?? containerRef);
  const op: SetChildSizingOperation = {
    id: createOperationId(),
    kind: "set-child-sizing",
    container: toChangeIrRef(containerRef),
    childIndex: command.childIndex,
    child,
    sizing: command.intent,
    timestamp: Date.now(),
    runtime: false,
    origin,
    confidence: 1,
    ...(declarations !== "" ? { value: declarations } : {}),
    ...(previousValues?.["child-sizing"] !== undefined
      ? { previousValue: previousValues["child-sizing"] }
      : {}),
  };
  return { ok: true, operations: [op] };
}

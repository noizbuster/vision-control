import {
  createOperationId,
  type DurableElementRef,
  type ResizeFlexPairOperation,
  ResizeFlexPairOperationSchema,
} from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import {
  type FlexDiagnostic,
  type PairedFlexResizeCandidate,
  validatePairedFlexResize,
} from "@vision-control/layout-engine";
import type { PreparedFlexPairResize } from "./flex-pair-resize-model.js";
import type { ResizeElementSnapshot } from "./resize-selection-context.js";

export interface FlexPairFrame {
  readonly primaryMainSize: number;
  readonly neighborMainSize: number;
  readonly containerRect: Rect;
  readonly witnessRects: readonly Rect[];
}

export type FlexPairOperationResult =
  | { readonly ok: true; readonly operation: ResizeFlexPairOperation }
  | { readonly ok: false; readonly diagnostic: FlexDiagnostic };

export type FlexPairFrameResult =
  | { readonly ok: true; readonly frame: FlexPairFrame }
  | { readonly ok: false; readonly diagnostic: FlexDiagnostic };

const failure = (message: string): FlexPairFrameResult => ({
  ok: false,
  diagnostic: { code: "intrinsic_validation_failed", message },
});

const rectOf = (element: Element): Rect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

const mainSize = (rect: Rect, axis: "x" | "y"): number => (axis === "x" ? rect.width : rect.height);

const rectMatches = (left: Rect, right: Rect): boolean =>
  Math.abs(left.x - right.x) <= 1 &&
  Math.abs(left.y - right.y) <= 1 &&
  Math.abs(left.width - right.width) <= 1 &&
  Math.abs(left.height - right.height) <= 1;

const durableRef = (snapshot: ResizeElementSnapshot): DurableElementRef | null => {
  const selector = snapshot.ref.selector;
  if (selector === undefined || selector.length === 0 || snapshot.fingerprint.length === 0)
    return null;
  return {
    runtimeId: snapshot.ref.runtimeId,
    selector,
    occurrence: snapshot.selectorOccurrence,
    fingerprint: snapshot.fingerprint,
    ...(snapshot.ref.sourceId !== undefined ? { sourceId: snapshot.ref.sourceId } : {}),
  };
};

const flexBasis = (value: number): string => `${Object.is(value, -0) ? 0 : value}px`;

const currentTreeMatches = (prepared: PreparedFlexPairResize): boolean => {
  const container = prepared.context.parent.element;
  if (!container.isConnected) return false;
  const currentChildren = Array.from(container.children);
  return (
    currentChildren.length === prepared.context.directChildren.length &&
    currentChildren.every(
      (element, index) => element === prepared.context.directChildren[index]?.element,
    ) &&
    !Array.from(container.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0,
    )
  );
};

export const preflightFlexPair = (prepared: PreparedFlexPairResize): boolean =>
  currentTreeMatches(prepared) &&
  prepared.primary.element.parentElement === prepared.context.parent.element &&
  prepared.neighbor.element.parentElement === prepared.context.parent.element;

export function measureAndValidateFlexPair(
  prepared: PreparedFlexPairResize,
  candidate: PairedFlexResizeCandidate,
): FlexPairFrameResult {
  if (!currentTreeMatches(prepared)) return failure("direct flex children changed during resize");
  const primaryRect = rectOf(prepared.primary.element);
  const neighborRect = rectOf(prepared.neighbor.element);
  const frame: FlexPairFrame = {
    primaryMainSize: mainSize(primaryRect, prepared.axis.axis),
    neighborMainSize: mainSize(neighborRect, prepared.axis.axis),
    containerRect: rectOf(prepared.context.parent.element),
    witnessRects: prepared.witnesses.map((witness) => rectOf(witness.element)),
  };
  const memberValidation = validatePairedFlexResize({
    candidate,
    observed: {
      primaryBorderBoxMainSize: frame.primaryMainSize,
      neighborBorderBoxMainSize: frame.neighborMainSize,
    },
    tolerance: 1,
  });
  if (memberValidation.kind === "rejected") {
    return { ok: false, diagnostic: memberValidation.diagnostic };
  }
  const beforeTotal =
    prepared.primarySizing.beforeBorderBoxMainSize +
    prepared.neighborSizing.beforeBorderBoxMainSize;
  const pairIsExact =
    Math.abs(
      frame.primaryMainSize -
        prepared.primarySizing.beforeBorderBoxMainSize -
        candidate.requestedDelta,
    ) <= 1 &&
    Math.abs(
      frame.neighborMainSize -
        prepared.neighborSizing.beforeBorderBoxMainSize +
        candidate.requestedDelta,
    ) <= 1 &&
    Math.abs(frame.primaryMainSize + frame.neighborMainSize - beforeTotal) <= 1;
  if (!pairIsExact) return failure("observed flex pair did not conserve the requested delta");
  if (!rectMatches(frame.containerRect, prepared.context.parent.rect)) {
    return failure("flex container geometry changed during pair resize");
  }
  if (
    frame.witnessRects.length !== prepared.witnesses.length ||
    frame.witnessRects.some(
      (rect, index) => !rectMatches(rect, prepared.witnesses[index]?.rect ?? rect),
    )
  ) {
    return failure("non-paired flex witness geometry changed during pair resize");
  }
  return { ok: true, frame };
}

export function buildFlexPairOperation(input: {
  readonly prepared: PreparedFlexPairResize;
  readonly candidate: PairedFlexResizeCandidate;
  readonly runtime: boolean;
  readonly frame?: FlexPairFrame;
}): FlexPairOperationResult {
  const primary = durableRef(input.prepared.primary);
  const neighbor = durableRef(input.prepared.neighbor);
  const container = durableRef(input.prepared.context.parent);
  const witnessRefs = input.prepared.witnesses.map(durableRef);
  if (primary === null || neighbor === null || container === null || witnessRefs.includes(null)) {
    return {
      ok: false,
      diagnostic: { code: "malformed_model", message: "durable flex pair identity is incomplete" },
    };
  }
  const operation = ResizeFlexPairOperationSchema.safeParse({
    id: createOperationId(),
    timestamp: Date.now(),
    runtime: input.runtime,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primary,
    container,
    members: [
      {
        role: "primary",
        element: primary,
        before: {
          flex: {
            flexGrow: input.prepared.primary.style.flexGrow,
            flexShrink: input.prepared.primary.style.flexShrink,
            flexBasis: input.prepared.primary.style.flexBasis,
          },
          usedMainSize: input.prepared.primarySizing.beforeBorderBoxMainSize,
        },
        after: {
          flex: {
            flexGrow: "0",
            flexShrink: "0",
            flexBasis: flexBasis(input.candidate.primary.afterFlex.flexBasisPixels),
          },
          usedMainSize:
            input.frame?.primaryMainSize ?? input.candidate.primary.afterBorderBoxMainSize,
        },
      },
      {
        role: "neighbor",
        element: neighbor,
        before: {
          flex: {
            flexGrow: input.prepared.neighbor.style.flexGrow,
            flexShrink: input.prepared.neighbor.style.flexShrink,
            flexBasis: input.prepared.neighbor.style.flexBasis,
          },
          usedMainSize: input.prepared.neighborSizing.beforeBorderBoxMainSize,
        },
        after: {
          flex: {
            flexGrow: "0",
            flexShrink: "0",
            flexBasis: flexBasis(input.candidate.neighbor.afterFlex.flexBasisPixels),
          },
          usedMainSize:
            input.frame?.neighborMainSize ?? input.candidate.neighbor.afterBorderBoxMainSize,
        },
      },
    ],
    containerWitness: {
      before: input.prepared.context.parent.rect,
      after: input.frame?.containerRect ?? input.prepared.context.parent.rect,
    },
    witnesses: input.prepared.witnesses.map((witness, index) => ({
      element: witnessRefs[index],
      before: witness.rect,
      after: input.frame?.witnessRects[index] ?? witness.rect,
    })),
    axis: {
      writingMode: input.prepared.axisInput.writingMode,
      direction: input.prepared.axisInput.direction,
      flexDirection: input.prepared.axisInput.flexDirection,
      logicalAxis:
        input.prepared.axisInput.flexDirection === "row" ||
        input.prepared.axisInput.flexDirection === "row-reverse"
          ? "inline"
          : "block",
      physicalAxis: input.prepared.axis.axis,
      directionSign: input.prepared.axis.sign,
      handleBoundary: input.prepared.boundary,
    },
    delta: input.candidate.requestedDelta,
  });
  return operation.success
    ? { ok: true, operation: operation.data }
    : {
        ok: false,
        diagnostic: {
          code: "malformed_model",
          message: operation.error.issues.map((issue) => issue.path.join(".")).join(", "),
        },
      };
}

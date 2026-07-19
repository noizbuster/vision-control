import type { Point } from "@vision-control/geometry";
import {
  type FlexDiagnostic,
  type PairedFlexResizeCandidate,
  planPairedFlexResize,
} from "@vision-control/layout-engine";
import type { PreviewManager, PreviewTransaction } from "@vision-control/preview-engine";
import type { PreparedFlexPairResize } from "./flex-pair-resize-model.js";
import { buildFlexPairOperation, preflightFlexPair } from "./flex-pair-resize-operation.js";

export interface FlexPairPointer {
  readonly x: number;
  readonly y: number;
  readonly alt: boolean;
}

export interface AppliedFlexPairCandidate {
  readonly candidate: PairedFlexResizeCandidate;
  readonly transaction: PreviewTransaction;
}

export const computeFlexPairDelta = (input: {
  readonly prepared: PreparedFlexPairResize;
  readonly startPointer: Point;
  readonly pointer: FlexPairPointer;
}): number => {
  const coordinateDelta =
    input.prepared.axis.axis === "x"
      ? input.pointer.x - input.startPointer.x
      : input.pointer.y - input.startPointer.y;
  const outwardSign =
    input.prepared.physicalHandle === "left" || input.prepared.physicalHandle === "top" ? -1 : 1;
  return coordinateDelta * outwardSign * (input.pointer.alt ? 2 : 1);
};

export function applyFlexPairCandidate(input: {
  readonly prepared: PreparedFlexPairResize;
  readonly delta: number;
  readonly previewEngine: PreviewManager;
  readonly onDiagnostic: (diagnostic: FlexDiagnostic) => void;
}): AppliedFlexPairCandidate | null {
  if (Math.abs(input.delta) < 1 || !preflightFlexPair(input.prepared)) return null;
  const plan = planPairedFlexResize({
    requestedDelta: input.delta,
    primary: input.prepared.primarySizing,
    neighbor: input.prepared.neighborSizing,
  });
  if (plan.kind === "rejected") {
    input.onDiagnostic(plan.diagnostic);
    return null;
  }
  const preview = buildFlexPairOperation({
    prepared: input.prepared,
    candidate: plan.candidate,
    runtime: true,
  });
  if (!preview.ok) {
    input.onDiagnostic(preview.diagnostic);
    return null;
  }
  const transaction = input.previewEngine.beginTransaction();
  transaction.begin();
  transaction.apply(preview.operation);
  return { candidate: plan.candidate, transaction };
}

import {
  classifySemanticIntent,
  computeMoveInsertion,
  isGridRole,
  validateReparent,
} from "@vision-control/layout-engine";
import type { MoveCandidate, MoveDiagnostic, MoveEvaluation, MoveSource } from "./move-types.js";
import { buildFeasibility } from "./reparent-feasibility.js";

const invalid = (code: MoveDiagnostic["code"], message: string): MoveEvaluation => ({
  kind: "invalid",
  diagnostic: { code, message },
});

/** Evaluates one measured candidate without retaining browser DOM objects. */
export const evaluateMoveCandidate = (
  source: MoveSource,
  point: { readonly x: number; readonly y: number },
  candidate: MoveCandidate | null,
): MoveEvaluation => {
  if (candidate === null) return invalid("no-target", "Pointer is not over a valid Move target.");

  const sameParent = candidate.targetParent.ref.runtimeId === source.sourceParent.ref.runtimeId;
  const contentModel = validateReparent(candidate.targetParent.tagName, source.element.tagName);
  const semantic = classifySemanticIntent({
    sameParent,
    sourceParentRole: source.sourceParentRole,
    targetParentRole: candidate.layoutRole,
    validContentModel: contentModel.ok,
    sourceContextPositioned: source.sourceContextPositioned,
    targetContextPositioned: candidate.targetContextPositioned,
  });
  const emptyGridReparent =
    !sameParent &&
    !isGridRole(source.sourceParentRole) &&
    isGridRole(candidate.layoutRole) &&
    candidate.childCount === 0;

  if (semantic.kind === "unsupported-grid" && !emptyGridReparent) {
    return invalid("unsupported-grid", semantic.message);
  }
  if (semantic.kind === "unsupported-free-move") {
    return invalid("unsupported-free-move", semantic.message);
  }
  if (!sameParent && !contentModel.ok) {
    return invalid(
      "invalid-drop-target",
      `${contentModel.violation.code}: ${contentModel.violation.reason}`,
    );
  }

  const insertion = computeMoveInsertion({
    parent: candidate.targetParent.ref,
    parentRect: candidate.parentRect,
    childCount: candidate.childCount,
    items: candidate.items,
    movingOrder: source.order,
    sourceIndex: sameParent ? source.sourceIndex : null,
    pointer: point,
    flow: candidate.flow,
  });
  if (!insertion.ok) return invalid(insertion.diagnostic.code, insertion.diagnostic.message);

  const intent = sameParent ? "reorder" : "reparent";
  const feasibility =
    intent === "reparent"
      ? buildFeasibility(source.element, candidate.targetParent, contentModel)
      : null;
  if (feasibility?.sourcePatch === "unsafe") {
    return invalid("unsafe-reparent", "Unsafe reparent boundary requires agent review.");
  }

  return { kind: "valid", intent, candidate, insertion, feasibility };
};

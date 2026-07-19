import type { ResizeFlexPairOperation } from "@vision-control/change-ir";
import { rectEquals } from "@vision-control/geometry";

import type { AssertionEntry, AssertionResult, ResolvedTarget } from "../types.js";
import { DEFAULT_GEOMETRY_TOLERANCE } from "../types.js";
import {
  formatRect,
  isAssertionResult,
  observe,
  resolveOrFailure,
  usedMainSize,
  withinTolerance,
} from "./flex-resize-support.js";

function assertMemberSizes(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:member-sizes", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const primary = usedMainSize(target.dom.getRect(resolved.primary), operation.axis.physicalAxis);
  const neighbor = usedMainSize(target.dom.getRect(resolved.neighbor), operation.axis.physicalAxis);
  const passed =
    withinTolerance(primary, operation.members[0].after.usedMainSize) &&
    withinTolerance(neighbor, operation.members[1].after.usedMainSize);
  return observe({
    name: "resize-flex-pair:member-sizes",
    passed,
    expected: `${operation.members[0].after.usedMainSize},${operation.members[1].after.usedMainSize} (±1px)`,
    actual: `${primary},${neighbor}`,
    success: "Both member used main sizes match.",
    failure: "One or both member used main sizes differ by more than 1px.",
  });
}

function assertPairGeometry(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:pair-geometry", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const primary = usedMainSize(target.dom.getRect(resolved.primary), operation.axis.physicalAxis);
  const neighbor = usedMainSize(target.dom.getRect(resolved.neighbor), operation.axis.physicalAxis);
  const beforeTotal =
    operation.members[0].before.usedMainSize + operation.members[1].before.usedMainSize;
  const afterTotal =
    operation.members[0].after.usedMainSize + operation.members[1].after.usedMainSize;
  const passed =
    withinTolerance(primary - operation.members[0].before.usedMainSize, operation.delta) &&
    withinTolerance(neighbor - operation.members[1].before.usedMainSize, -operation.delta) &&
    withinTolerance(afterTotal, beforeTotal) &&
    withinTolerance(primary + neighbor, beforeTotal);
  return observe({
    name: "resize-flex-pair:pair-geometry",
    passed,
    expected: `delta ${operation.delta}/-${operation.delta}; total ${beforeTotal} (±1px)`,
    actual: `delta ${primary - operation.members[0].before.usedMainSize}/${neighbor - operation.members[1].before.usedMainSize}; total ${primary + neighbor}`,
    success: "Pair delta and combined used size are conserved.",
    failure: "Pair delta or combined used size differs by more than 1px.",
  });
}

function assertContainerGeometry(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:container-geometry", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const actual = target.dom.getRect(resolved.container);
  const expected = operation.containerWitness.after;
  const passed = rectEquals(actual, expected, DEFAULT_GEOMETRY_TOLERANCE);
  return observe({
    name: "resize-flex-pair:container-geometry",
    passed,
    expected: `${formatRect(expected)} (±1px)`,
    actual: formatRect(actual),
    success: "Container geometry matches its witness.",
    failure: "Container geometry differs from its witness by more than 1px.",
  });
}

function assertWitnessGeometry(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:witness-geometry", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const failures: string[] = [];
  for (const [index, witness] of resolved.witnesses.entries()) {
    const actual = target.dom.getRect(witness.element);
    if (!rectEquals(actual, witness.expected.after, DEFAULT_GEOMETRY_TOLERANCE)) {
      failures.push(
        `witness[${index}] expected ${formatRect(witness.expected.after)} got ${formatRect(actual)}`,
      );
    }
  }
  return observe({
    name: "resize-flex-pair:witness-geometry",
    passed: failures.length === 0,
    expected: `${operation.witnesses.length} witness rect(s) within 1px`,
    actual:
      failures.length === 0
        ? `${operation.witnesses.length} witness rect(s) matched`
        : failures.join("; "),
    success: "Every non-paired witness geometry matches.",
    failure: `Witness geometry mismatch: ${failures.join("; ")}.`,
  });
}

export function buildFlexResizeGeometryAssertions(
  operation: ResizeFlexPairOperation,
): AssertionEntry[] {
  return [
    {
      name: "resize-flex-pair:member-sizes",
      run: (target) => assertMemberSizes(target, operation),
    },
    {
      name: "resize-flex-pair:pair-geometry",
      run: (target) => assertPairGeometry(target, operation),
    },
    {
      name: "resize-flex-pair:container-geometry",
      run: (target) => assertContainerGeometry(target, operation),
    },
    {
      name: "resize-flex-pair:witness-geometry",
      run: (target) => assertWitnessGeometry(target, operation),
    },
  ];
}

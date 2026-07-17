import type { Operation } from "@vision-control/change-ir";

import { assertParent } from "./assertions/parent.js";
import { assertSiblingOrder } from "./assertions/sibling-order.js";
import type { AssertionEntry } from "./types.js";

export function buildReparentAssertions(
  operation: Extract<Operation, { kind: "reparent-element" }>,
): AssertionEntry[] {
  const expectedParentSelector =
    operation.targetParent.selector ??
    `[data-vc-source="${operation.targetParent.sourceId ?? ""}"]`;
  return [
    {
      name: "reparent-element:parent",
      run: (target) => assertParent(target, expectedParentSelector),
    },
    {
      name: "reparent-element:targetIndex",
      run: (target) => assertSiblingOrder(target, operation.targetIndex),
    },
  ];
}

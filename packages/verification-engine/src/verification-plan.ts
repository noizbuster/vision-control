/**
 * Verification plan generation.
 *
 * Given a source operation and the identity candidate for its target element,
 * generate the list of assertions that prove the operation landed in the DOM.
 *
 * Mapping (PRD section 12.5):
 *   style-edit      → computed-style assertion (property + value)
 *   text-edit       → text assertion (newText)
 *   class-add       → class assertion (className present)
 *   class-remove    → class assertion (className absent)
 *   class-replace   → class assertion (oldClass absent + newClass present)
 *   resize-element  → computed-style assertion (property + toValue)
 *   reorder-child   → sibling-order assertion (child at toIndex)
 *   reparent-element → parent assertion (element under targetParent selector)
 *
 * Every plan also implicitly includes `assertExists` (added by the runner, not
 * stored here, so plan assertions stay focused on operation-specific checks).
 */

import type { Operation } from "@vision-control/change-ir";

import { assertClass, type ExpectedClass } from "./assertions/class.js";
import { assertComputedStyle } from "./assertions/computed-style.js";
import { assertParent } from "./assertions/parent.js";
import { assertSiblingOrder } from "./assertions/sibling-order.js";
import { assertText } from "./assertions/text.js";
import type { AssertionEntry, SourceCandidate, VerificationPlan } from "./types.js";

/**
 * Build a {@link VerificationPlan} from a source operation.
 *
 * @param operation The operation that was applied as source intent.
 * @param sourceCandidate Identity hints for the operation's target element,
 *   used by the runner to reacquire the element after HMR.
 */
export function createPlan(
  operation: Operation,
  sourceCandidate: SourceCandidate,
): VerificationPlan {
  const assertions = assertionsForOperation(operation);
  return { sourceCandidate, assertions };
}

/** Generate operation-specific assertions via exhaustive match on `kind`. */
function assertionsForOperation(operation: Operation): AssertionEntry[] {
  switch (operation.kind) {
    case "style-edit":
      return [
        {
          name: "style-edit:value",
          run: (target) =>
            assertComputedStyle(target, [{ property: operation.property, value: operation.value }]),
        },
      ];

    case "text-edit":
      return [
        {
          name: "text-edit:newText",
          run: (target) => assertText(target, operation.newText),
        },
      ];

    case "class-add":
      return [
        {
          name: "class-add",
          run: (target) => assertClass(target, [{ name: operation.className, present: true }]),
        },
      ];

    case "class-remove":
      return [
        {
          name: "class-remove",
          run: (target) => assertClass(target, [{ name: operation.className, present: false }]),
        },
      ];

    case "class-replace": {
      const expected: ExpectedClass[] = [
        { name: operation.oldClassName, present: false },
        { name: operation.newClassName, present: true },
      ];
      return [
        {
          name: "class-replace",
          run: (target) => assertClass(target, expected),
        },
      ];
    }

    case "resize-element":
      return [
        {
          name: "resize-element:value",
          run: (target) =>
            assertComputedStyle(target, [
              { property: operation.property, value: `${operation.toValue}${operation.unit}` },
            ]),
        },
      ];

    case "reorder-child":
      return [
        {
          name: "reorder-child:toIndex",
          run: (target) => assertSiblingOrder(target, operation.toIndex),
        },
      ];

    case "reparent-element":
      return [
        {
          name: "reparent-element:parent",
          run: (target) =>
            assertParent(
              target,
              operation.targetParent.selector ??
                `[data-vc-source="${operation.targetParent.sourceId ?? ""}"]`,
            ),
        },
      ];

    default: {
      const _: never = operation;
      _;
      return [];
    }
  }
}

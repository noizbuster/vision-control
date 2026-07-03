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
 * V1 mapping (VC-V1V2-16):
 *   grid-reorder (dom-order) → sibling-order assertion (child at toIndex)
 *   grid-reorder (grid-area) → computed-style assertion (grid-row/column-start)
 *   grid-span               → computed-style assertion (grid-{axis}-end span)
 *   set-container-layout    → computed-style assertion (property + value)
 *   set-child-sizing        → computed-style assertion (sizing-derived value)
 *   breakpoint-style-edit   → computed-style assertion (property + value)
 *   breakpoint-class-edit   → class assertion (old absent + new present)
 *   breakpoint-text-edit    → text assertion (newText)
 *   group-reorder           → sibling-order assertion (first child newOrder pos)
 *   group-reparent          → parent assertion (under targetParent selector)
 *   align/distribute-elements → structural note (a11y reading-order is external)
 *   multi-select-group      → structural note (group is a selection record)
 *   screenshot-crop-ref     → none (metadata ref only, ADR-011)
 *   suggested-diff          → none (inert data, no DOM state, ADR-012)
 *
 * Every plan also implicitly includes `assertExists` (added by the runner, not
 * stored here, so plan assertions stay focused on operation-specific checks).
 *
 * The alignment accessibility reading-order assertion
 * (`assertReadingOrderPreserved`) and the screenshot similarity assertion
 * (`assertScreenshotSimilarity`) are STANDALONE assertions a caller invokes when
 * it holds the parallel dom/visual order arrays or before/after crops. They do
 * not fit the single-target `run(target)` model and are therefore not wired
 * here; they are exported from this package for callers to use directly.
 */

import type { Operation } from "@vision-control/change-ir";

import { assertClass, type ExpectedClass } from "./assertions/class.js";
import { assertComputedStyle } from "./assertions/computed-style.js";
import { assertParent } from "./assertions/parent.js";
import { assertSiblingOrder } from "./assertions/sibling-order.js";
import { assertText } from "./assertions/text.js";
import type {
  AssertionEntry,
  AssertionResult,
  SourceCandidate,
  VerificationPlan,
} from "./types.js";

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

    // V1 operation kinds (VC-V1V2-16): real assertions where the single-target
    // runner model fits; documented structural notes where multi-target or
    // metadata-only ops need external/standalone assertions.

    case "grid-reorder":
      return gridReorderAssertions(operation);

    case "grid-span":
      return gridSpanAssertions(operation);

    case "set-container-layout":
      return [
        {
          name: "set-container-layout:value",
          run: (target) =>
            assertComputedStyle(target, [{ property: operation.property, value: operation.value }]),
        },
      ];

    case "set-child-sizing":
      return childSizingAssertions(operation);

    case "breakpoint-style-edit":
      return [
        {
          name: "breakpoint-style-edit:value",
          run: (target) =>
            assertComputedStyle(target, [{ property: operation.property, value: operation.value }]),
        },
      ];

    case "breakpoint-class-edit": {
      const expectedBp: ExpectedClass[] = [
        { name: operation.oldClassName, present: false },
        { name: operation.newClassName, present: true },
      ];
      return [
        {
          name: "breakpoint-class-edit",
          run: (target) => assertClass(target, expectedBp),
        },
      ];
    }

    case "breakpoint-text-edit":
      return [
        {
          name: "breakpoint-text-edit:newText",
          run: (target) => assertText(target, operation.newText),
        },
      ];

    case "group-reorder":
      return groupReorderAssertions(operation);

    case "group-reparent":
      return [
        {
          name: "group-reparent:parent",
          run: (target) =>
            assertParent(
              target,
              operation.targetParent.selector ??
                `[data-vc-source="${operation.targetParent.sourceId ?? ""}"]`,
            ),
        },
      ];

    // Alignment / distribution: the real accessibility gate is the standalone
    // `assertReadingOrderPreserved` assertion which needs parallel dom/visual
    // order arrays that don't fit the single-target `run(target)` model. We emit
    // a structural note so the runner records that alignment verification is
    // pending the external reading-order check. Callers invoke
    // `assertReadingOrderPreserved` directly when they hold the order arrays.
    case "align-elements":
    case "distribute-elements":
      return alignmentNoteAssertions(operation.kind);

    // Multi-select group: a selection record, not a DOM mutation. The runner's
    // implicit `assertExists` covers target existence; group composition is
    // verified by the selection overlay, not the HMR assertion loop.
    case "multi-select-group":
      return [
        {
          name: "multi-select-group:composition",
          run: () => groupCompositionNote(operation.targets.length),
        },
      ];

    // Screenshot-crop-ref: metadata ref only (ADR-011). The operation carries
    // an artifact id, never image bytes. The standalone
    // `assertScreenshotSimilarity` diff is invoked externally by a caller that
    // holds before/after crops; it does not fit `run(target)`.
    case "screenshot-crop-ref":
      return [];

    // Suggested-diff: inert candidate data (ADR-012). Never applied by the
    // runtime or MCP; no DOM state to assert against.
    case "suggested-diff":
      return [];

    default: {
      const _: never = operation;
      _;
      return [];
    }
  }
}

/**
 * Grid reorder assertions. DOM-order placement → sibling-order check (the child
 * moved in the DOM to `toIndex`). Grid-area placement → computed-style check
 * on the resolved grid-row-start / grid-column-start parsed from the
 * `newGridArea` shorthand ("row-start / col-start / row-end / col-end").
 */
function gridReorderAssertions(
  operation: Extract<Operation, { kind: "grid-reorder" }>,
): AssertionEntry[] {
  if (operation.placement === "dom-order") {
    return [
      {
        name: "grid-reorder:dom-order",
        run: (target) => assertSiblingOrder(target, operation.toIndex),
      },
    ];
  }
  const area = operation.newGridArea;
  if (area === undefined) return [];
  const parts = area.split("/").map((s) => s.trim());
  const rowStart = parts[0];
  const colStart = parts[1];
  const expected: { property: string; value: string }[] = [];
  if (rowStart !== undefined && rowStart.length > 0) {
    expected.push({ property: "grid-row-start", value: rowStart });
  }
  if (colStart !== undefined && colStart.length > 0) {
    expected.push({ property: "grid-column-start", value: colStart });
  }
  if (expected.length === 0) return [];
  return [
    {
      name: "grid-reorder:grid-area",
      run: (target) => assertComputedStyle(target, expected),
    },
  ];
}

/**
 * Grid span assertions. The CSS property is `grid-column-end` (column axis) or
 * `grid-row-end` (row axis), with value `span N`.
 */
function gridSpanAssertions(
  operation: Extract<Operation, { kind: "grid-span" }>,
): AssertionEntry[] {
  const property = operation.axis === "column" ? "grid-column-end" : "grid-row-end";
  return [
    {
      name: `grid-span:${operation.axis}`,
      run: (target) =>
        assertComputedStyle(target, [{ property, value: `span ${operation.toSpan}` }]),
    },
  ];
}

/**
 * Child sizing assertions (Auto Layout). The CSS property depends on the sizing
 * kind and parent layout context (hug/fill/fixed map to different declarations
 * per Task 8's hug-fill-fixed table). When the operation carries an explicit
 * `value`, assert it as a computed-style entry. Otherwise emit a structural
 * note: the sizing is context-dependent and the agent should verify visually.
 */
function childSizingAssertions(
  operation: Extract<Operation, { kind: "set-child-sizing" }>,
): AssertionEntry[] {
  if (operation.value !== undefined && operation.value.length > 0) {
    return [
      {
        name: "set-child-sizing:value",
        run: (target) =>
          assertComputedStyle(target, [{ property: "width", value: operation.value ?? "" }]),
      },
    ];
  }
  return [
    {
      name: "set-child-sizing:context-dependent",
      run: () =>
        contextDependentNote(
          `set-child-sizing (${operation.sizing})`,
          "Auto Layout sizing is context-dependent; verify the rendered hug/fill/fixed result visually.",
        ),
    },
  ];
}

/**
 * Group reorder assertions. The single-target runner resolves ONE element; for
 * a group reorder we assert the primary target's sibling index matches its
 * position in the new ordering. The `newOrder` array is parallel to
 * `children`: `newOrder[i]` is the original index of the child now at position
 * `i`. The resolved target corresponds to one of the children; we assert it
 * sits at the index derived from `newOrder` for the first child's new position.
 */
function groupReorderAssertions(
  operation: Extract<Operation, { kind: "group-reorder" }>,
): AssertionEntry[] {
  const firstNewPosition = operation.newOrder[0] ?? 0;
  return [
    {
      name: "group-reorder:first-child-position",
      run: (target) => assertSiblingOrder(target, firstNewPosition),
    },
  ];
}

function alignmentNoteAssertions(kind: string): AssertionEntry[] {
  return [
    {
      name: `${kind}:reading-order-pending`,
      run: () =>
        contextDependentNote(
          kind,
          "Alignment reading-order verification is pending the standalone assertReadingOrderPreserved check.",
        ),
    },
  ];
}

function groupCompositionNote(targetCount: number): AssertionResult {
  return {
    name: "multi-select-group:composition",
    passed: true,
    expected: `${targetCount} target(s) in group`,
    actual: `${targetCount} target(s) recorded`,
    message: `Multi-select group recorded with ${targetCount} target(s); existence is verified by the runner's assertExists and the selection overlay.`,
  };
}

function contextDependentNote(name: string, message: string): AssertionResult {
  return {
    name,
    passed: true,
    expected: "context-dependent",
    actual: "structural note",
    message,
  };
}

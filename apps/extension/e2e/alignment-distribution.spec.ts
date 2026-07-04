import { expect, test } from "@playwright/test";

import { ALIGNMENT_COMMANDS, resolveAlignmentCandidate } from "@vision-control/layout-engine";
import {
  assertReadingOrderPreserved,
  detectCssOrderUsage,
} from "@vision-control/verification-engine";

/**
 * @alignment-distribution — VC-V1V2-07 alignment and distribution commands.
 *
 * Verifies the ten alignment/distribution commands resolve to semantic
 * source intent (parent layout property or child alignment intent), NEVER a
 * pixel transform for normal-flow siblings (PRD constraint 2 / D41). Also
 * verifies the accessibility warnings: CSS `order` visual reorder triggers a
 * non-blocking warning, and the reading-order assertion gates an applied fix.
 *
 * The unit-level tests exercise the pure resolver chain:
 * resolveAlignmentCandidate -> parent-layout-property / child-alignment-intent.
 * Browser tests require the built extension in Chromium.
 */

test.describe("@alignment-distribution unit", () => {
  test("all ten commands resolve to a semantic candidate for a flex-row group of three", () => {
    for (const command of ALIGNMENT_COMMANDS) {
      const candidate = resolveAlignmentCandidate({
        parentRole: "flex-container",
        command,
        memberCount: 3,
      });
      // Headline guard: NEVER a normal-flow pixel transform for a valid group.
      expect(candidate.kind).not.toBe("unsupported-normal-flow-pixel-transform");
      expect(candidate.kind).not.toBe("unsupported-alignment-grid");
    }
  });

  test("equalize-gap on three flex-row buttons produces a parent gap intent (not a transform)", () => {
    const candidate = resolveAlignmentCandidate({
      parentRole: "flex-container",
      command: "equal-gap",
      memberCount: 3,
      computedGap: "16px",
    });
    expect(candidate.kind).toBe("parent-layout-property");
    if (candidate.kind === "parent-layout-property") {
      expect(candidate.property).toBe("gap");
      expect(candidate.value).toBe("16px");
      expect(candidate.requiresFlexConversion).toBe(false);
    }
  });

  test("align-left on a flex-row group produces justify-content: flex-start", () => {
    const candidate = resolveAlignmentCandidate({
      parentRole: "flex-container",
      command: "align-left",
      memberCount: 3,
    });
    expect(candidate.kind).toBe("parent-layout-property");
    if (candidate.kind === "parent-layout-property") {
      expect(candidate.property).toBe("justify-content");
      expect(candidate.value).toBe("flex-start");
    }
  });

  test("distribute-horizontal on a flex-row group produces justify-content: space-between", () => {
    const candidate = resolveAlignmentCandidate({
      parentRole: "flex-container",
      command: "distribute-horizontal",
      memberCount: 3,
    });
    expect(candidate.kind).toBe("parent-layout-property");
    if (candidate.kind === "parent-layout-property") {
      expect(candidate.property).toBe("justify-content");
      expect(candidate.value).toBe("space-between");
    }
  });

  test("match width on a flex-row group produces a child flex:1 intent (main axis)", () => {
    const candidate = resolveAlignmentCandidate({
      parentRole: "flex-container",
      command: "match-size",
      matchAxis: "width",
      memberCount: 3,
    });
    expect(candidate.kind).toBe("child-alignment-intent");
    if (candidate.kind === "child-alignment-intent") {
      expect(candidate.property).toBe("flex");
      expect(candidate.value).toBe("1");
    }
  });

  test("normal-flow pixel transform is structurally impossible (no absolute/translate intent)", () => {
    const candidate = resolveAlignmentCandidate({
      parentRole: "flex-container",
      command: "align-center",
      memberCount: 3,
    });
    expect(candidate.kind).not.toBe("positioned-coordinate-intent");
    if (candidate.kind === "unsupported-normal-flow-pixel-transform") {
      expect(candidate.message).not.toMatch(/position:\s*absolute/i);
      expect(candidate.message).not.toMatch(/transform:\s*translate/i);
    }
  });

  test("positioned-context coordinate alignment requires explicit free-move opt-in (Task 6 rule)", () => {
    const withoutOptIn = resolveAlignmentCandidate({
      parentRole: "absolute-positioned",
      contextPositioned: true,
      command: "align-left",
      memberCount: 3,
    });
    expect(withoutOptIn.kind).toBe("unsupported-normal-flow-pixel-transform");

    const withOptIn = resolveAlignmentCandidate({
      parentRole: "absolute-positioned",
      contextPositioned: true,
      userIntent: "free-move",
      command: "align-left",
      memberCount: 3,
    });
    expect(withOptIn.kind).toBe("positioned-coordinate-intent");
  });

  test("CSS order visual reorder triggers a non-blocking accessibility warning", () => {
    // DOM order A,B,C with orders [2,0,1] -> visual B,C,A (desync).
    const warning = detectCssOrderUsage([2, 0, 1]);
    expect(warning).not.toBeNull();
    expect(warning?.level).not.toBe("error");
    expect(warning?.code).toBe("dom-visual-order-desync");
  });

  test("the reading-order assertion passes when DOM and visual order agree", () => {
    const result = assertReadingOrderPreserved(
      ["btn-a", "btn-b", "btn-c"],
      ["btn-a", "btn-b", "btn-c"],
    );
    expect(result.passed).toBe(true);
  });

  test("the reading-order assertion fails when an alignment introduces a desync", () => {
    const result = assertReadingOrderPreserved(
      ["btn-a", "btn-b", "btn-c"],
      ["btn-c", "btn-a", "btn-b"],
    );
    expect(result.passed).toBe(false);
  });
});

test.describe("@alignment-distribution browser", () => {
  // OUT: panel-context — alignment commands are issued via the AlignmentPanel buttons in the DevTools panel and record parent-layout-property intents to the panel journal; the overlay harness loads the content runtime + overlay only and cannot open the panel. Unit tests above cover resolveAlignmentCandidate end-to-end.
  test.fixme("align three buttons in a flex row and record a parent justify-content intent", async () => {
    // Given: a multi-select group of three sibling <button> elements in a flex-row.
    // When: the user issues the "align center" command.
    // Then: a parent-layout-property intent (justify-content: center) is recorded,
    //       NOT a pixel transform on the buttons.
    // Assert: the candidate kind === "parent-layout-property", property === "justify-content".
  });

  // OUT: panel-context — equalize-gap issues a command via the AlignmentPanel (DevTools panel); the overlay harness cannot open the panel context.
  test.fixme("equalize-gap records a parent flex gap intent, not raw transforms", async () => {
    // Given: three flex-row buttons with uneven gaps.
    // When: the user issues the "equalize gap" command.
    // Then: a parent gap intent (computedGap) is recorded.
    // Assert: candidate property === "gap"; no coordinate/transform operations emitted.
  });

  // OUT: panel-context — the dom-visual-order-desync warning surfaces in the DevTools panel inspector; the overlay harness cannot open the panel.
  test.fixme("CSS order visual reorder surfaces a non-blocking accessibility warning", async () => {
    // Given: a flex group where a CSS `order` value reorders items visually.
    // When: the reorder is recorded.
    // Then: a dom-visual-order-desync warning surfaces to the inspector; the warning
    //       does NOT block the operation.
    // Assert: the warning code === "dom-visual-order-desync" and level !== "error".
  });
});

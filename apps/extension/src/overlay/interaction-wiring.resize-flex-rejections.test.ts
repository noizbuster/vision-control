import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlexPairDom } from "../components/interaction/flex-pair-resize-test-fixture.js";
import {
  createInteractionHarness,
  dispatchPointer,
  flushRaf,
  type InteractionHarness,
  prepareResizeHandle,
  requireSelectionContext,
} from "./interaction-wiring.test-fixtures.js";

type RejectionCase = {
  readonly name: string;
  readonly prepare: (fixture: ReturnType<typeof createFlexPairDom>) => void;
  readonly reason: string;
};

const REJECTIONS: readonly RejectionCase[] = [
  {
    name: "wrap",
    prepare: ({ container }) => {
      container.style.flexWrap = "wrap";
    },
    reason: "wrapped_layout",
  },
  {
    name: "order",
    prepare: ({ neighbor }) => {
      neighbor.style.order = "1";
    },
    reason: "nonzero_order",
  },
  {
    name: "transform",
    prepare: ({ primary }) => {
      primary.style.transform = "scale(1.1)";
    },
    reason: "transform_affected_geometry",
  },
  {
    name: "zoom",
    prepare: ({ container }) => {
      container.style.zoom = "2";
    },
    reason: "zoom_affected_geometry",
  },
  {
    name: "auto margin",
    prepare: ({ neighbor }) => {
      neighbor.style.marginLeft = "auto";
    },
    reason: "main_axis_auto_margin",
  },
  {
    name: "indefinite container",
    prepare: ({ container }) => {
      container.style.width = "auto";
    },
    reason: "indefinite_container_main_size",
  },
  {
    name: "anonymous direct text",
    prepare: ({ container }) => {
      container.append("anonymous");
    },
    reason: "anonymous_flex_item",
  },
  {
    name: "missing edge neighbor",
    prepare: ({ neighbor, witness }) => {
      neighbor.remove();
      witness.remove();
    },
    reason: "missing_visual_neighbor",
  },
];

describe("interaction wiring flex resize rejections", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it.each(REJECTIONS)("rejects $name atomically", ({ prepare, reason }) => {
    // Given
    const fixture = createFlexPairDom();
    prepare(fixture);
    harness.controllers.onSelectionChange(requireSelectionContext(fixture.primary));
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 41 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 41 });

    // Then
    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "flex-pair-rejected", reason }),
    );
    expect(handle).toHaveProperty("disabled", true);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
  });

  it("rejects an explicit min clamp without a partial preview", () => {
    // Given
    const fixture = createFlexPairDom();
    fixture.neighbor.style.minWidth = "120px";
    harness.controllers.onSelectionChange(requireSelectionContext(fixture.primary));
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 42 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 42 });

    // Then
    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "flex-pair-rejected", reason: "min_max_clamp" }),
    );
    expect(handle).toHaveProperty("disabled", true);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
  });

  it("rolls back when an intrinsic constraint misses the planned size after layout", async () => {
    // Given
    const fixture = createFlexPairDom();
    fixture.neighbor.style.minWidth = "min-content";
    harness.controllers.onSelectionChange(requireSelectionContext(fixture.primary));
    vi.spyOn(fixture.neighbor, "getBoundingClientRect").mockReturnValue(
      new DOMRect(200, 0, 140, 80),
    );
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 43 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 43 });
    await flushRaf();

    // Then
    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: "flex-pair-rejected",
        reason: "intrinsic_validation_failed",
      }),
    );
    expect(handle).toHaveProperty("disabled", true);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
  });
});

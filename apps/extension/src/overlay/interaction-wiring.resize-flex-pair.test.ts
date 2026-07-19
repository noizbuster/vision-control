import { redo, undo } from "@vision-control/change-journal";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPriorPairRules,
  createFlexPairDom,
  createIdenticalFlexPairDom,
  previewCss,
  selectFlexPrimary,
} from "../components/interaction/flex-pair-resize-test-fixture.js";
import {
  createInteractionHarness,
  dispatchPointer,
  flushRaf,
  type InteractionHarness,
  interactionOperationMessages,
  prepareResizeHandle,
  requireSelectionContext,
  setRect,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring flex-pair resize", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it("records one complete row/LTR east pair with literal +40/-40 sizes", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 21 });
    dispatchPointer(handle, "pointermove", { clientX: 200, clientY: 40, pointerId: 21 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 21 });
    await flushRaf();

    // Then
    const operations = harness.controllers.getRecordedOperations();
    expect(harness.diagnostics).toEqual([]);
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    expect(operation?.kind).toBe("resize-flex-pair");
    if (operation?.kind !== "resize-flex-pair") return;
    expect(operation.delta).toBe(40);
    expect(operation.members.map((member) => member.after.usedMainSize)).toEqual([200, 100]);
    expect(operation.members.map((member) => member.after.flex)).toEqual([
      { flexGrow: "0", flexShrink: "0", flexBasis: "178px" },
      { flexGrow: "0", flexShrink: "0", flexBasis: "100px" },
    ]);
    expect(operation.witnesses).toHaveLength(1);
    expect(operation.witnesses[0]?.after).toEqual({ x: 300, y: 0, width: 100, height: 80 });
    expect(operation.containerWitness.after).toEqual({ x: 0, y: 0, width: 400, height: 80 });
    expect(interactionOperationMessages(harness.bus)).toHaveLength(1);
    expect(harness.controllers.getJournal().entries).toHaveLength(1);
  });

  it("uses final pointer coordinates and retains the validated aggregate preview", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 22 });
    dispatchPointer(handle, "pointermove", { clientX: 180, clientY: 40, pointerId: 22 });

    // When
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 22 });
    await flushRaf();

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(harness.diagnostics).toEqual([]);
    expect(operation?.kind).toBe("resize-flex-pair");
    if (operation?.kind !== "resize-flex-pair") return;
    expect(operation.delta).toBe(40);
    expect(previewCss()).toContain("flex-basis: 178px");
    expect(previewCss()).toContain("flex-basis: 100px");
    expect(harness.previewManager.activeCount).toBe(1);
  });

  it("invalidates pointerup validation on detach and restores prior declarations", async () => {
    // Given
    const fixture = createFlexPairDom();
    const [primarySelector, neighborSelector] = applyPriorPairRules(harness, fixture);
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 23 });

    // When
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 23 });
    harness.controllers.resize.detach();
    await flushRaf();

    // Then
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
    expect(previewCss()).toBe(
      `${primarySelector} { color: red; }\n${neighborSelector} { opacity: .75; }`,
    );
  });

  it("invalidates pointerup validation on pointercancel without retaining CSS", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 24 });

    // When
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 24 });
    dispatchPointer(handle, "pointercancel", { clientX: 200, clientY: 40, pointerId: 24 });
    await flushRaf();

    // Then
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
    expect(previewCss()).not.toContain("flex-basis");
  });

  it("rolls back a held pair when pointer capture is lost", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 28 });
    dispatchPointer(handle, "pointermove", { clientX: 200, clientY: 40, pointerId: 28 });
    await flushRaf();
    expect(harness.previewManager.activeCount).toBe(1);

    // When
    dispatchPointer(handle, "lostpointercapture", { pointerId: 28 });

    // Then
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
    expect(handle.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("invalidates pointerup validation when selection changes", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 25 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 25 });
    const replacement = document.createElement("div");
    replacement.style.cssText = "display:block;width:50px;height:50px";
    document.body.appendChild(replacement);
    setRect(replacement, { x: 0, y: 100, width: 50, height: 50 });

    // When
    harness.controllers.onSelectionChange(requireSelectionContext(replacement));
    await flushRaf();

    // Then
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.previewManager.activeCount).toBe(0);
  });

  it("keeps selector occurrence and fingerprint distinct enough for identical siblings", async () => {
    // Given
    const fixture = createIdenticalFlexPairDom();
    const selection = requireSelectionContext(fixture.primary);
    const snapshots = selection.resize.directChildren;
    expect(snapshots.map((snapshot) => snapshot.ref.selector)).toEqual([
      "div.identical-cell",
      "div.identical-cell",
      "div.identical-cell",
    ]);
    expect(snapshots.map((snapshot) => snapshot.selectorOccurrence)).toEqual([0, 1, 2]);
    expect(new Set(snapshots.map((snapshot) => snapshot.fingerprint)).size).toBe(1);
    harness.controllers.onSelectionChange(selection);
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 40, pointerId: 26 });
    dispatchPointer(handle, "pointerup", { clientX: 140, clientY: 40, pointerId: 26 });
    await flushRaf();

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-flex-pair");
    if (operation?.kind !== "resize-flex-pair") return;
    expect(operation.members.map((member) => member.element.occurrence)).toEqual([0, 1]);
    expect(operation.witnesses.map((witness) => witness.element.occurrence)).toEqual([2]);
    expect(operation.members.map((member) => member.after.usedMainSize)).toEqual([140, 60]);
  });

  it("undoes and redoes both retained member triples as one aggregate", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 27 });
    dispatchPointer(handle, "pointerup", { clientX: 200, clientY: 40, pointerId: 27 });
    await flushRaf();

    // When
    const undone = undo(harness.controllers.getJournal());
    harness.previewManager.applyOperation(undone.inverse);
    const afterUndo = [fixture.primary, fixture.neighbor].map(
      (element) => element.getBoundingClientRect().width,
    );
    const redone = redo(undone.journal);
    harness.previewManager.applyOperation(redone.operation);

    // Then
    expect(undone.inverse.kind).toBe("resize-flex-pair");
    expect(redone.operation.kind).toBe("resize-flex-pair");
    expect(afterUndo).toEqual([160, 140]);
    expect(
      [fixture.primary, fixture.neighbor].map((element) => element.getBoundingClientRect().width),
    ).toEqual([200, 100]);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(1);
  });
});

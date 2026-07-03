import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import {
  createInitialState,
  createPointerId,
  type Effect,
  type InteractionMachineState,
  transition,
} from "./index.js";

const ref = (tag: string, id: string = `${tag}-1`): ElementRef => ({
  runtimeId: id,
  tagName: tag,
});

const run = (
  state: InteractionMachineState,
  ...events: readonly Parameters<typeof transition>[1][]
): InteractionMachineState => events.reduce((s, e) => transition(s, e).state, state);

const hasError = (effects: readonly Effect[], code: string): boolean =>
  effects.some((e) => e.kind === "error" && e.error.code === code);

/** Drive the machine to `selected` with a chosen element. */
const selected = (target: ElementRef = ref("div")): InteractionMachineState =>
  run(
    createInitialState(),
    { type: "pick-start" },
    { type: "element-clicked", target },
    { type: "pick-end" },
  );

/** Drive the machine to `selected.dragging` (press -> threshold exceeded). */
const dragging = (target: ElementRef = ref("div")): InteractionMachineState =>
  run(
    selected(target),
    { type: "drag-start", pointerId: createPointerId("ptr-1"), target },
    { type: "drag-threshold-exceeded" },
  );

describe("interaction machine: legal transitions", () => {
  it("transitions idle -> hovering -> awaiting-commit -> selected", () => {
    const target = ref("button");
    const s1 = transition(createInitialState(), { type: "pick-start" }).state;
    expect(s1.value).toBe("hovering");

    const s2 = transition(s1, { type: "element-clicked", target }).state;
    expect(s2.value).toBe("selected.awaiting-commit");
    expect(s2.context.pendingSelection).toEqual(target);

    const s3 = transition(s2, { type: "pick-end" }).state;
    expect(s3.value).toBe("selected");
    expect(s3.context.selection).toEqual(target);
  });

  it("emits show-outline on element-clicked and open-inspector on selection commit", () => {
    const target = ref("section");
    const afterClick = transition(transition(createInitialState(), { type: "pick-start" }).state, {
      type: "element-clicked",
      target,
    });
    expect(afterClick.effects).toContainEqual({ kind: "show-outline", target });

    const afterCommit = transition(afterClick.state, { type: "pick-end" });
    expect(afterCommit.effects).toContainEqual({ kind: "open-inspector", target });
  });

  it("starts a drag through preparing-drag then dragging, acquiring the pointer", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const press = transition(selected(target), { type: "drag-start", pointerId: pid, target });
    expect(press.state.value).toBe("selected.preparing-drag");
    expect(press.state.context.dragTarget).toEqual(target);
    expect(press.effects).toContainEqual({ kind: "begin-drag", target, pointerId: pid });

    const live = transition(press.state, { type: "drag-threshold-exceeded" });
    expect(live.state.value).toBe("selected.dragging");
    expect(live.effects).toContainEqual({ kind: "drag-confirmed" });
    expect(live.state.context.activePointer.activeOwner).toEqual({
      pointerId: pid,
      owner: "drag",
    });
  });

  it("ends a drag back to selected and releases the pointer", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const ended = transition(dragging(target), { type: "drag-end", pointerId: pid });
    expect(ended.state.value).toBe("selected");
    expect(ended.state.context.activePointer.activeOwner).toBeNull();
    expect(ended.state.context.dragTarget).toBeNull();
    expect(ended.effects).toContainEqual({ kind: "end-drag" });
  });

  it("starts and ends a resize, tracking the handle", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-2");
    const resizing = transition(selected(target), {
      type: "resize-start",
      handle: "se",
      pointerId: pid,
    });
    expect(resizing.state.value).toBe("selected.resizing");
    expect(resizing.state.context.resizeHandle).toBe("se");
    expect(resizing.effects).toContainEqual({ kind: "begin-resize", handle: "se", pointerId: pid });

    const ended = transition(resizing.state, { type: "resize-end" });
    expect(ended.state.value).toBe("selected");
    expect(ended.state.context.resizeHandle).toBeNull();
  });

  it("runs the text-edit lifecycle", () => {
    const editing = transition(selected(), { type: "text-edit-start" });
    expect(editing.state.value).toBe("selected.editing-text");
    const ended = transition(editing.state, { type: "text-edit-end" });
    expect(ended.state.value).toBe("selected");
  });

  it("runs the style-edit lifecycle", () => {
    const editing = transition(selected(), { type: "style-edit-start" });
    expect(editing.state.value).toBe("selected.editing-style");
    const ended = transition(editing.state, { type: "style-edit-end" });
    expect(ended.state.value).toBe("selected");
  });

  it("runs the preview lifecycle (dragging -> reorder-preview -> commit)", () => {
    const target = ref("div");
    const previewing = transition(dragging(target), { type: "preview-start", kind: "reorder" });
    expect(previewing.state.value).toBe("selected.dragging.reorder-preview");
    expect(previewing.state.context.previewKind).toBe("reorder");
    expect(previewing.effects).toContainEqual({ kind: "begin-preview" });

    const committed = transition(previewing.state, { type: "preview-commit" });
    expect(committed.state.value).toBe("selected");
    expect(committed.effects).toContainEqual({ kind: "commit-preview" });
  });

  it("emits move-drag-preview on drag-move", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const moved = transition(dragging(target), {
      type: "drag-move",
      pointerId: pid,
      delta: { x: 10, y: 5 },
    });
    expect(moved.effects).toContainEqual({ kind: "move-drag-preview", delta: { x: 10, y: 5 } });
  });

  it("escape cancels a drag back to selected with end-drag", () => {
    const target = ref("div");
    const escaped = transition(dragging(target), { type: "escape" });
    expect(escaped.state.value).toBe("selected");
    expect(escaped.state.context.activePointer.activeOwner).toBeNull();
    expect(escaped.effects).toContainEqual({ kind: "end-drag" });
  });

  it("escape from a preview rolls back the transaction", () => {
    const target = ref("div");
    const preview = transition(dragging(target), { type: "preview-start", kind: "reparent" }).state;
    const escaped = transition(preview, { type: "escape" });
    expect(escaped.state.value).toBe("selected");
    expect(escaped.effects).toContainEqual({ kind: "rollback-preview" });
    expect(escaped.effects).toContainEqual({ kind: "end-drag" });
  });

  it("runs the marquee-selecting lifecycle", () => {
    const pid = createPointerId("m-1");
    const start = transition(selected(), { type: "marquee-start", pointerId: pid });
    expect(start.state.value).toBe("selected.marquee-selecting");
    expect(start.effects).toContainEqual({ kind: "begin-marquee", pointerId: pid });
    const ended = transition(start.state, { type: "marquee-end" });
    expect(ended.state.value).toBe("selected");
    expect(ended.effects).toContainEqual({ kind: "end-marquee" });
  });

  it("runs the verifying lifecycle", () => {
    const started = transition(selected(), { type: "verify-start" });
    expect(started.state.value).toBe("verifying");
    expect(started.effects).toContainEqual({ kind: "begin-verify" });
    const ended = transition(started.state, { type: "verify-end" });
    expect(ended.state.value).toBe("selected");
    expect(ended.effects).toContainEqual({ kind: "end-verify" });
  });

  it("deselect returns to idle and clears the selection", () => {
    const out = transition(selected(ref("div")), { type: "deselect" });
    expect(out.state.value).toBe("idle");
    expect(out.state.context.selection).toBeNull();
    expect(out.effects).toContainEqual({ kind: "close-inspector" });
    expect(out.effects).toContainEqual({ kind: "hide-outline" });
  });
});

describe("interaction machine: illegal transitions", () => {
  it("rejects drag-start from idle (illegal-transition, state unchanged)", () => {
    const pid = createPointerId("ptr-1");
    const out = transition(createInitialState(), {
      type: "drag-start",
      pointerId: pid,
      target: ref("div"),
    });
    expect(out.state.value).toBe("idle");
    expect(hasError(out.effects, "illegal-transition")).toBe(true);
  });

  it("rejects resize-end from idle", () => {
    const out = transition(createInitialState(), { type: "resize-end" });
    expect(out.state.value).toBe("idle");
    expect(hasError(out.effects, "illegal-transition")).toBe(true);
  });

  it("rejects preview-commit when not in a preview state", () => {
    const out = transition(selected(), { type: "preview-commit" });
    expect(out.state.value).toBe("selected");
    expect(hasError(out.effects, "illegal-transition")).toBe(true);
  });
});

describe("interaction machine: pointer-ownership invariant (one owner at a time)", () => {
  it("REJECTS drag-start while resizing (state stays resizing, pointer-busy error)", () => {
    const target = ref("div");
    const resizePid = createPointerId("resize-ptr");
    const dragPid = createPointerId("drag-ptr");

    const resizing = transition(selected(target), {
      type: "resize-start",
      handle: "e",
      pointerId: resizePid,
    }).state;
    expect(resizing.value).toBe("selected.resizing");

    // The negative test: a drag-start arrives while a resize owns the pointer.
    const rejected = transition(resizing, { type: "drag-start", pointerId: dragPid, target });
    expect(rejected.state.value).toBe("selected.resizing");
    expect(rejected.state.context.activePointer.activeOwner?.owner).toBe("resize");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });

  it("REJECTS resize-start while dragging (state stays dragging, pointer-busy error)", () => {
    const target = ref("div");
    const resizePid = createPointerId("resize-ptr");

    const rejected = transition(dragging(target), {
      type: "resize-start",
      handle: "n",
      pointerId: resizePid,
    });
    expect(rejected.state.value).toBe("selected.dragging");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });
});

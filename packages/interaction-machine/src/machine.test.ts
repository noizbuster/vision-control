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

describe("interaction machine: legal transitions", () => {
  it("transitions idle -> inspecting -> selecting -> selected", () => {
    const target = ref("button");
    const s1 = transition(createInitialState(), { type: "pick-start" }).state;
    expect(s1.value).toBe("inspecting");

    const s2 = transition(s1, { type: "element-clicked", target }).state;
    expect(s2.value).toBe("selecting");
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

  it("starts a drag from selected, acquires the pointer, and emits begin-drag", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const result = transition(selected(target), { type: "drag-start", pointerId: pid, target });
    expect(result.state.value).toBe("dragging");
    expect(result.state.context.dragTarget).toEqual(target);
    expect(result.state.context.activePointer.activeOwner).toEqual({
      pointerId: pid,
      owner: "drag",
    });
    expect(result.effects).toContainEqual({ kind: "begin-drag", target, pointerId: pid });
  });

  it("ends a drag back to selected and releases the pointer", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const dragging = transition(selected(target), {
      type: "drag-start",
      pointerId: pid,
      target,
    }).state;
    const ended = transition(dragging, { type: "drag-end", pointerId: pid });
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
    expect(resizing.state.value).toBe("resizing");
    expect(resizing.state.context.resizeHandle).toBe("se");
    expect(resizing.effects).toContainEqual({ kind: "begin-resize", handle: "se", pointerId: pid });

    const ended = transition(resizing.state, { type: "resize-end" });
    expect(ended.state.value).toBe("selected");
    expect(ended.state.context.resizeHandle).toBeNull();
  });

  it("runs the text-edit lifecycle", () => {
    const editing = transition(selected(), { type: "text-edit-start" });
    expect(editing.state.value).toBe("editing-text");
    const ended = transition(editing.state, { type: "text-edit-end" });
    expect(ended.state.value).toBe("selected");
  });

  it("runs the preview lifecycle (drag -> preview -> commit)", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const dragging = transition(selected(target), {
      type: "drag-start",
      pointerId: pid,
      target,
    }).state;
    const previewing = transition(dragging, { type: "preview-start" });
    expect(previewing.state.value).toBe("previewing");
    expect(previewing.effects).toContainEqual({ kind: "begin-preview" });

    const committed = transition(previewing.state, { type: "preview-commit" });
    expect(committed.state.value).toBe("selected");
    expect(committed.effects).toContainEqual({ kind: "commit-preview" });
  });

  it("emits move-drag-preview on drag-move", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const dragging = transition(selected(target), {
      type: "drag-start",
      pointerId: pid,
      target,
    }).state;
    const moved = transition(dragging, {
      type: "drag-move",
      pointerId: pid,
      delta: { x: 10, y: 5 },
    });
    expect(moved.effects).toContainEqual({ kind: "move-drag-preview", delta: { x: 10, y: 5 } });
  });

  it("escape cancels a drag back to selected with a rollback", () => {
    const target = ref("div");
    const pid = createPointerId("ptr-1");
    const dragging = transition(selected(target), {
      type: "drag-start",
      pointerId: pid,
      target,
    }).state;
    const escaped = transition(dragging, { type: "escape" });
    expect(escaped.state.value).toBe("selected");
    expect(escaped.state.context.activePointer.activeOwner).toBeNull();
    expect(escaped.effects).toContainEqual({ kind: "rollback-preview" });
    expect(escaped.effects).toContainEqual({ kind: "end-drag" });
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

  it("rejects preview-commit when not previewing", () => {
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
    expect(resizing.value).toBe("resizing");

    // The negative test: a drag-start arrives while a resize owns the pointer.
    const rejected = transition(resizing, { type: "drag-start", pointerId: dragPid, target });
    expect(rejected.state.value).toBe("resizing");
    expect(rejected.state.context.activePointer.activeOwner?.owner).toBe("resize");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
    const err = rejected.effects.find(
      (e): e is Extract<Effect, { kind: "error" }> => e.kind === "error",
    );
    expect(err?.error.code).toBe("pointer-busy");
  });

  it("REJECTS resize-start while dragging (state stays dragging, pointer-busy error)", () => {
    const target = ref("div");
    const dragPid = createPointerId("drag-ptr");
    const resizePid = createPointerId("resize-ptr");

    const dragging = transition(selected(target), {
      type: "drag-start",
      pointerId: dragPid,
      target,
    }).state;
    const rejected = transition(dragging, {
      type: "resize-start",
      handle: "n",
      pointerId: resizePid,
    });
    expect(rejected.state.value).toBe("dragging");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });
});

import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import {
  createInitialState,
  createPointerId,
  type Effect,
  type InteractionMachineState,
  type TransitionLog,
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

const selected = (target: ElementRef = ref("div")): InteractionMachineState =>
  run(
    createInitialState(),
    { type: "pick-start" },
    { type: "element-clicked", target },
    { type: "pick-end" },
  );

const dragging = (target: ElementRef = ref("div")): InteractionMachineState =>
  run(
    selected(target),
    { type: "drag-start", pointerId: createPointerId("ptr-1"), target },
    { type: "drag-threshold-exceeded" },
  );

const hasError = (effects: readonly Effect[], code: string): boolean =>
  effects.some((e) => e.kind === "error" && e.error.code === code);

const pid = (s: string) => createPointerId(s);

// ---------------------------------------------------------------------------
// PRD section 10 invariant 1 — at most one pointer-owning interaction at a time
// ---------------------------------------------------------------------------

describe("PRD 10 invariant 1: one pointer-owning interaction at a time", () => {
  it("REJECTS a marquee-start while a drag owns the pointer", () => {
    const rejected = transition(dragging(), { type: "marquee-start", pointerId: pid("m") });
    expect(rejected.state.value).toBe("selected.dragging");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });

  it("REJECTS a drag-start while a marquee owns the pointer", () => {
    const marqueeing = transition(selected(), { type: "marquee-start", pointerId: pid("m") }).state;
    const rejected = transition(marqueeing, {
      type: "drag-start",
      pointerId: pid("d"),
      target: ref("span"),
    });
    expect(rejected.state.value).toBe("selected.marquee-selecting");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });

  it("REJECTS a resize-start while a drag preview owns the pointer", () => {
    const preview = transition(dragging(), { type: "preview-start", kind: "reorder" }).state;
    const rejected = transition(preview, {
      type: "resize-start",
      handle: "n",
      pointerId: pid("r"),
    });
    expect(rejected.state.value).toBe("selected.dragging.reorder-preview");
    expect(hasError(rejected.effects, "pointer-busy")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PRD section 10 invariant 2 — no source selection change during drag
// ---------------------------------------------------------------------------

describe("PRD 10 invariant 2: no selection change mid-drag", () => {
  it("REJECTS element-clicked while dragging (selection-locked)", () => {
    const rejected = transition(dragging(), { type: "element-clicked", target: ref("other") });
    expect(rejected.state.value).toBe("selected.dragging");
    expect(hasError(rejected.effects, "selection-locked")).toBe(true);
  });

  it("REJECTS element-clicked while resizing (selection-locked)", () => {
    const resizing = transition(selected(), {
      type: "resize-start",
      handle: "e",
      pointerId: pid("r"),
    }).state;
    const rejected = transition(resizing, { type: "element-clicked", target: ref("other") });
    expect(rejected.state.value).toBe("selected.resizing");
    expect(hasError(rejected.effects, "selection-locked")).toBe(true);
  });

  it("REJECTS element-clicked while a drag preview is open (selection-locked)", () => {
    const preview = transition(dragging(), { type: "preview-start", kind: "free-position" }).state;
    const rejected = transition(preview, { type: "element-clicked", target: ref("other") });
    expect(rejected.state.value).toBe("selected.dragging.free-position-preview");
    expect(hasError(rejected.effects, "selection-locked")).toBe(true);
  });

  it("ALLOWS element-clicked from selected (re-select is legal when no gesture owns the pointer)", () => {
    const out = transition(selected(), { type: "element-clicked", target: ref("next") });
    expect(out.state.value).toBe("selected.awaiting-commit");
    expect(hasError(out.effects, "selection-locked")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PRD section 10 invariant 3 — preview transaction ends in commit or rollback
// ---------------------------------------------------------------------------

describe("PRD 10 invariant 3: preview transaction commit-or-rollback", () => {
  const inReorderPreview = (): InteractionMachineState =>
    transition(dragging(), { type: "preview-start", kind: "reorder" }).state;

  it("REJECTS a non-terminal event from a preview state (preview-open)", () => {
    const rejected = transition(inReorderPreview(), { type: "resize-end" });
    expect(rejected.state.value).toBe("selected.dragging.reorder-preview");
    expect(hasError(rejected.effects, "preview-open")).toBe(true);
  });

  it("REJECTS a style-edit-start from a preview state (preview-open)", () => {
    const rejected = transition(inReorderPreview(), { type: "style-edit-start" });
    expect(rejected.state.value).toBe("selected.dragging.reorder-preview");
    expect(hasError(rejected.effects, "preview-open")).toBe(true);
  });

  it("ALLOWS preview-commit (terminal) leaving the preview", () => {
    const out = transition(inReorderPreview(), { type: "preview-commit" });
    expect(out.state.value).toBe("selected");
    expect(out.effects).toContainEqual({ kind: "commit-preview" });
  });

  it("ALLOWS preview-rollback (terminal) back to dragging", () => {
    const out = transition(inReorderPreview(), { type: "preview-rollback" });
    expect(out.state.value).toBe("selected.dragging");
    expect(out.state.context.previewKind).toBeNull();
    expect(out.effects).toContainEqual({ kind: "rollback-preview" });
  });

  it("ALLOWS drag-end from a preview as a drop-to-commit", () => {
    const out = transition(inReorderPreview(), { type: "drag-end", pointerId: pid("ptr-1") });
    expect(out.state.value).toBe("selected");
    expect(out.effects).toContainEqual({ kind: "commit-preview" });
  });

  it("each preview kind enters its own leaf", () => {
    const reorder = transition(dragging(), { type: "preview-start", kind: "reorder" }).state.value;
    const reparent = transition(dragging(), { type: "preview-start", kind: "reparent" }).state
      .value;
    const free = transition(dragging(), { type: "preview-start", kind: "free-position" }).state
      .value;
    expect(reorder).toBe("selected.dragging.reorder-preview");
    expect(reparent).toBe("selected.dragging.reparent-preview");
    expect(free).toBe("selected.dragging.free-position-preview");
  });
});

// ---------------------------------------------------------------------------
// PRD section 10 invariant 4 — iframe navigation cancels the active interaction
// ---------------------------------------------------------------------------

describe("PRD 10 invariant 4: iframe-navigation cancels active interaction", () => {
  it("cancels an active drag: rolls back, releases pointer, returns to selected", () => {
    const target = ref("div");
    const out = transition(dragging(target), { type: "iframe-navigate" });
    expect(out.state.value).toBe("selected");
    expect(out.state.context.activePointer.activeOwner).toBeNull();
    expect(out.state.context.dragTarget).toBeNull();
    expect(out.effects).toContainEqual({ kind: "end-drag" });
    // selection is preserved (the browser layer decides element survival)
    expect(out.state.context.selection).toEqual(target);
  });

  it("cancels an open preview transaction with a rollback on iframe-navigate", () => {
    const preview = transition(dragging(), { type: "preview-start", kind: "reparent" }).state;
    const out = transition(preview, { type: "iframe-navigate" });
    expect(out.state.value).toBe("selected");
    expect(out.effects).toContainEqual({ kind: "rollback-preview" });
    expect(out.effects).toContainEqual({ kind: "end-drag" });
    expect(out.state.context.activePointer.activeOwner).toBeNull();
  });

  it("cancels an active resize on iframe-navigate", () => {
    const resizing = transition(selected(), {
      type: "resize-start",
      handle: "se",
      pointerId: pid("r"),
    }).state;
    const out = transition(resizing, { type: "iframe-navigate" });
    expect(out.state.value).toBe("selected");
    expect(out.effects).toContainEqual({ kind: "end-resize" });
    expect(out.state.context.activePointer.activeOwner).toBeNull();
  });

  it("is a no-op when no gesture is active (nothing to cancel)", () => {
    const out = transition(selected(), { type: "iframe-navigate" });
    expect(out.state.value).toBe("selected");
    expect(out.effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PRD section 10 invariant 5 — page reload discards stale runtime ids
// ---------------------------------------------------------------------------

describe("PRD 10 invariant 5: page-reload discards runtime ids", () => {
  it("from a selected+dragging state, resets to disconnected and clears every runtime id", () => {
    const target = ref("div");
    const out = transition(dragging(target), { type: "page-reload" });
    expect(out.state.value).toBe("disconnected");
    expect(out.state.context.selection).toBeNull();
    expect(out.state.context.pendingSelection).toBeNull();
    expect(out.state.context.dragTarget).toBeNull();
    expect(out.state.context.resizeHandle).toBeNull();
    expect(out.state.context.activePointer.activeOwner).toBeNull();
    expect(out.effects).toContainEqual({ kind: "clear-runtime-ids" });
    expect(out.effects).toContainEqual({ kind: "disconnect" });
  });

  it("from idle, still transitions to disconnected (universal)", () => {
    const out = transition(createInitialState(), { type: "page-reload" });
    expect(out.state.value).toBe("disconnected");
  });

  it("disconnected is a sink: only reconnect exits; page-reload keeps it disconnected", () => {
    const disconnected = transition(createInitialState(), { type: "page-reload" }).state;
    const stillDown = transition(disconnected, { type: "page-reload" });
    expect(stillDown.state.value).toBe("disconnected");

    const blocked = transition(disconnected, { type: "element-clicked", target: ref("x") });
    expect(blocked.state.value).toBe("disconnected");
    expect(hasError(blocked.effects, "illegal-transition")).toBe(true);

    const reconnected = transition(disconnected, { type: "reconnect" });
    expect(reconnected.state.value).toBe("idle");
    expect(reconnected.state.context.selection).toBeNull();
    expect(reconnected.effects).toContainEqual({ kind: "reconnect" });
  });
});

// ---------------------------------------------------------------------------
// PRD section 10:776 — every transition emits a debug log
// ---------------------------------------------------------------------------

describe("PRD 10:776: every transition emits a debug log", () => {
  const assertLog = (
    log: TransitionLog,
    from: string,
    to: string,
    event: string,
    outcome: TransitionLog["outcome"],
  ): void => {
    expect(log.from).toBe(from);
    expect(log.to).toBe(to);
    expect(log.event).toBe(event);
    expect(log.outcome).toBe(outcome);
  };

  it("an applied transition logs outcome applied", () => {
    const out = transition(createInitialState(), { type: "pick-start" });
    assertLog(out.log, "idle", "hovering", "pick-start", "applied");
  });

  it("a rejected transition logs outcome rejected with unchanged state", () => {
    const out = transition(createInitialState(), { type: "resize-end" });
    assertLog(out.log, "idle", "idle", "resize-end", "rejected");
    expect(hasError(out.effects, "illegal-transition")).toBe(true);
  });

  it("a no-op transition (escape in idle) logs outcome no-op", () => {
    const out = transition(createInitialState(), { type: "escape" });
    assertLog(out.log, "idle", "idle", "escape", "no-op");
  });

  it("a pointer-busy rejection logs outcome rejected", () => {
    const out = transition(dragging(), { type: "resize-start", handle: "n", pointerId: pid("r") });
    expect(out.log.outcome).toBe("rejected");
    expect(out.log.from).toBe("selected.dragging");
    expect(out.log.to).toBe("selected.dragging");
  });

  it("an invariant-violation rejection (selection-locked) is logged as rejected", () => {
    const out = transition(dragging(), { type: "element-clicked", target: ref("x") });
    assertLog(out.log, "selected.dragging", "selected.dragging", "element-clicked", "rejected");
  });
});

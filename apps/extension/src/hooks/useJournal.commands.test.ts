import { act, renderHook } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "../journal/flex-resize-operation.test-fixture.js";
import { useJournal } from "./useJournal.js";
import { makeFakePreviewManager, styleEdit } from "./useJournal.test-fixtures.js";

describe("useJournal preview commands", () => {
  it("undo applies the inverse through the preview engine", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(styleEdit("op-record-004", "blue", "red")));
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("reverted");
    expect(state().applied).toHaveLength(2);
    expect(state().applied[1]?.inverseOf).toBe("op-record-004");
  });

  it("redo reapplies the original through the preview engine", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(styleEdit("op-record-005", "blue", "red")));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.entries[0]?.status).toBe("committed");
    expect(state().applied).toHaveLength(3);
  });

  it("clear resets history and the preview engine", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(styleEdit("op-record-006", "blue")));
    act(() => result.current.clear());
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(state().cleared).toBe(true);
  });

  it("records and undoes while disconnected", () => {
    const dispatched: Operation[] = [];
    const { result } = renderHook(() =>
      useJournal({
        connectionState: "disconnected",
        dispatchOperation: (operation) => dispatched.push(operation),
      }),
    );
    act(() => result.current.record(styleEdit("op-offline-001", "blue", "red")));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.inverseOf).toBe("op-offline-001");
  });
});

describe("useJournal dispatch commands", () => {
  it("undo dispatches one stored inverse", () => {
    const dispatched: Operation[] = [];
    const { result } = renderHook(() =>
      useJournal({ dispatchOperation: (operation) => dispatched.push(operation) }),
    );
    act(() => result.current.record(styleEdit("op-dispatch-001", "blue", "red")));
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.inverseOf).toBe("op-dispatch-001");
    if (dispatched[0]?.kind !== "style-edit") return;
    expect(dispatched[0].value).toBe("red");
  });

  it("redo dispatches one original operation", () => {
    const dispatched: Operation[] = [];
    const { result } = renderHook(() =>
      useJournal({ dispatchOperation: (operation) => dispatched.push(operation) }),
    );
    act(() => result.current.record(styleEdit("op-dispatch-002", "blue", "red")));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(dispatched).toHaveLength(2);
    expect(dispatched[1]?.id).toBe("op-dispatch-002");
  });

  it("dispatches one aggregate pair command for undo and redo", () => {
    const dispatched: Operation[] = [];
    const pair = makeFlexResizeOperation();
    const { result } = renderHook(() =>
      useJournal({ dispatchOperation: (operation) => dispatched.push(operation) }),
    );
    act(() => result.current.recordRemote(pair));
    expect(result.current.entries).toHaveLength(1);
    act(() => result.current.undo());
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.kind).toBe("resize-flex-pair");
    if (dispatched[0]?.kind !== "resize-flex-pair") return;
    expect(dispatched[0].members[0].after).toEqual(pair.members[0].before);
    act(() => result.current.redo());
    expect(dispatched).toHaveLength(2);
    expect(dispatched[1]).toEqual(pair);
  });

  it("dispatches clear and empties history", () => {
    const cleared: boolean[] = [];
    const { result } = renderHook(() => useJournal({ dispatchClear: () => cleared.push(true) }));
    act(() => result.current.record(styleEdit("op-dispatch-003", "blue")));
    act(() => result.current.clear());
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(cleared).toEqual([true]);
  });

  it("does not dispatch while recording", () => {
    const dispatched: Operation[] = [];
    const { result } = renderHook(() =>
      useJournal({ dispatchOperation: (operation) => dispatched.push(operation) }),
    );
    act(() => result.current.record(styleEdit("op-dispatch-004", "blue")));
    expect(dispatched).toHaveLength(0);
    expect(result.current.entries).toHaveLength(1);
  });

  it("updates history without an engine or dispatcher", () => {
    const { result } = renderHook(() => useJournal({}));
    act(() => result.current.record(styleEdit("op-dispatch-005", "blue", "red")));
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("reverted");
  });
});

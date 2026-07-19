import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useJournal } from "./useJournal.js";
import { makeFakePreviewManager, styleEdit } from "./useJournal.test-fixtures.js";

describe("useJournal recording", () => {
  it("records committed after a successful preview transaction", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(styleEdit("op-record-001", "blue", "red")));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("committed");
    expect(state().applied).toHaveLength(1);
    expect(state().applied[0]?.id).toBe("op-record-001");
  });

  it("records preview without an engine", () => {
    const withoutEngine = renderHook(() => useJournal({ previewEngine: null }));
    act(() => withoutEngine.result.current.record(styleEdit("op-record-002", "blue")));
    expect(withoutEngine.result.current.entries[0]?.status).toBe("preview");
  });

  it("records preview when commit fails", () => {
    const { manager } = makeFakePreviewManager(true);
    const failed = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => failed.result.current.record(styleEdit("op-record-003", "blue")));
    expect(failed.result.current.entries[0]?.status).toBe("preview");
  });

  it("derives connection state", () => {
    const { result } = renderHook(() => useJournal({ connectionState: "connected" }));
    expect(result.current.isConnected).toBe(true);
  });

  it("lists entries newest-first", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => result.current.record(styleEdit("op-record-007", "blue")));
    act(() => result.current.record(styleEdit("op-record-008", "green")));
    expect(result.current.entries[0]?.operation.id).toBe("op-record-008");
    expect(result.current.entries[1]?.operation.id).toBe("op-record-007");
  });

  it("commits a pending entry", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => result.current.record(styleEdit("op-record-009", "blue")));
    const id = result.current.entries[0]?.id;
    expect(id).toBeDefined();
    act(() => {
      if (id !== undefined) result.current.commitEntry(id);
    });
    expect(result.current.entries[0]?.status).toBe("committed");
  });

  it("commits an existing local entry when content echoes it", () => {
    const operation = styleEdit("op-record-echo", "blue");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => result.current.record(operation));
    act(() => result.current.recordRemote(operation));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.operation.id).toBe("op-record-echo");
    expect(result.current.entries[0]?.status).toBe("committed");
  });

  it("ignores duplicate remote operations", () => {
    const operation = styleEdit("op-remote-duplicate", "blue");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => result.current.recordRemote(operation));
    act(() => result.current.recordRemote(operation));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.status).toBe("committed");
  });

  it("keeps the operation index current across batched updates", () => {
    const operationA = styleEdit("op-batched-a", "blue");
    const operationB = styleEdit("op-batched-b", "green");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => {
      result.current.record(operationA);
      result.current.recordRemote(operationA);
      result.current.record(operationB);
    });
    act(() => result.current.recordRemote(operationB));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries.map((entry) => entry.operation.id).sort()).toEqual([
      "op-batched-a",
      "op-batched-b",
    ]);
    expect(new Set(result.current.entries.map((entry) => entry.sequence)).size).toBe(2);
  });
});

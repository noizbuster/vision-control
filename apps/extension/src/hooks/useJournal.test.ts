import { act, renderHook } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
import type {
  PreviewManager,
  PreviewTransaction,
  StylesheetManager,
  TransactionState,
} from "@vision-control/preview-engine";
import { describe, expect, it } from "vitest";

import { useJournal } from "./useJournal.js";

const BASE_TIME = 1_700_000_000_000;

function styleEdit(id: string, value: string, previousValue = "red"): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    kind: "style-edit",
    target: { runtimeId: "btn-1" },
    property: "color",
    value,
    important: false,
    previousValue,
  };
}

interface FakePreviewState {
  readonly applied: readonly Operation[];
  readonly cleared: boolean;
}

function makeFakePreviewManager(failCommit = false): {
  manager: PreviewManager;
  state: () => FakePreviewState;
} {
  const applied: Operation[] = [];
  let cleared = false;
  const manager: PreviewManager = {
    get stylesheet(): StylesheetManager {
      throw new Error("not used");
    },
    get diagnostics() {
      return [];
    },
    get hasSimulatedPreviews() {
      return false;
    },
    get activeCount() {
      return applied.length;
    },
    beginTransaction: (): PreviewTransaction => {
      const ops: Operation[] = [];
      const tx: PreviewTransaction = {
        id: "tx-fake-0000",
        get state(): TransactionState {
          return "pending";
        },
        get operations() {
          return ops;
        },
        hasRuntimeMutation: () => false,
        begin: () => {},
        apply: (operation) => {
          if (failCommit) throw new Error("apply failed");
          applied.push(operation);
          ops.push(operation);
          return tx;
        },
        rollback: () => {},
        commit: () => {
          if (failCommit) throw new Error("commit failed");
        },
      };
      return tx;
    },
    applyOperation: () => () => {},
    applyTransform: () => () => {},
    clearAll: () => {
      cleared = true;
      applied.length = 0;
    },
  };
  return { manager, state: () => ({ applied: [...applied], cleared }) };
}

describe("useJournal", () => {
  it("records an entry as committed when the preview transaction commits", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-001", "blue", "red"));
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("committed");
    expect(state().applied).toHaveLength(1);
    expect(state().applied[0]?.id).toBe("op-record-001");
  });

  it("records an entry as pending when there is no preview engine", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));

    act(() => {
      result.current.record(styleEdit("op-record-002", "blue"));
    });

    expect(result.current.entries[0]?.status).toBe("pending");
  });

  it("marks an entry pending when the preview commit fails", () => {
    const { manager } = makeFakePreviewManager(true);
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-003", "blue"));
    });

    expect(result.current.entries[0]?.status).toBe("pending");
  });

  it("undo applies the inverse via the preview engine and rolls back the entry", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-004", "blue", "red"));
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("rolled-back");
    expect(state().applied).toHaveLength(2);
    expect(state().applied[1]?.inverseOf).toBe("op-record-004");
  });

  it("redo re-applies the original operation and marks the entry committed", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-005", "blue", "red"));
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.entries[0]?.status).toBe("committed");
    expect(state().applied).toHaveLength(3);
  });

  it("clear resets the journal and calls preview clearAll", () => {
    const { manager, state } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-006", "blue"));
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.entries).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(state().cleared).toBe(true);
  });

  it("exposes isConnected derived from the connection state", () => {
    const { result } = renderHook(() => useJournal({ connectionState: "connected" }));
    expect(result.current.isConnected).toBe(true);
  });

  it("lists entries newest-first", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => {
      result.current.record(styleEdit("op-record-007", "blue"));
    });
    act(() => {
      result.current.record(styleEdit("op-record-008", "green"));
    });
    expect(result.current.entries[0]?.operation.id).toBe("op-record-008");
    expect(result.current.entries[1]?.operation.id).toBe("op-record-007");
  });

  it("commitEntry transitions a pending entry to committed", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => {
      result.current.record(styleEdit("op-record-009", "blue"));
    });
    const id = result.current.entries[0]?.id;
    expect(id).toBeDefined();
    act(() => {
      if (id !== undefined) result.current.commitEntry(id);
    });
    expect(result.current.entries[0]?.status).toBe("committed");
  });
});

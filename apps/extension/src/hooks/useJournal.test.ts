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
    origin: "property-panel" as const,
    confidence: 1,
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

  it("records an entry as preview when there is no preview engine", () => {
    const { result } = renderHook(() => useJournal({ previewEngine: null }));

    act(() => {
      result.current.record(styleEdit("op-record-002", "blue"));
    });

    expect(result.current.entries[0]?.status).toBe("preview");
  });

  it("marks an entry preview when the preview commit fails", () => {
    const { manager } = makeFakePreviewManager(true);
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));

    act(() => {
      result.current.record(styleEdit("op-record-003", "blue"));
    });

    expect(result.current.entries[0]?.status).toBe("preview");
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
    expect(result.current.entries[0]?.status).toBe("reverted");
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

  it("records and undoes edits when the agent bridge is disconnected", () => {
    const dispatched: Operation[] = [];
    const { result } = renderHook(() =>
      useJournal({
        connectionState: "disconnected",
        dispatchOperation: (operation) => {
          dispatched.push(operation);
        },
      }),
    );

    act(() => {
      result.current.record(styleEdit("op-offline-001", "blue", "red"));
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.inverseOf).toBe("op-offline-001");
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

  it("commits an existing local entry when content echoes the same operation", () => {
    const operation = styleEdit("op-record-echo", "blue");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));

    act(() => {
      result.current.record(operation);
    });
    act(() => {
      result.current.recordRemote(operation);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.operation.id).toBe("op-record-echo");
    expect(result.current.entries[0]?.status).toBe("committed");
  });

  it("ignores duplicate remote operations with the same operation id", () => {
    const operation = styleEdit("op-remote-duplicate", "blue");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));

    act(() => {
      result.current.recordRemote(operation);
    });
    act(() => {
      result.current.recordRemote(operation);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.operation.id).toBe("op-remote-duplicate");
    expect(result.current.entries[0]?.status).toBe("committed");
  });

  it("keeps the operation index current across batched appends and commits", () => {
    const operationA = styleEdit("op-batched-a", "blue");
    const operationB = styleEdit("op-batched-b", "green");
    const { result } = renderHook(() => useJournal({ previewEngine: null }));

    act(() => {
      result.current.record(operationA);
      result.current.recordRemote(operationA);
      result.current.record(operationB);
    });
    act(() => {
      result.current.recordRemote(operationB);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries.map((entry) => entry.operation.id).sort()).toEqual([
      "op-batched-a",
      "op-batched-b",
    ]);
    expect(new Set(result.current.entries.map((entry) => entry.sequence)).size).toBe(2);
  });

  describe("dispatch path (panel routes edits to content via the bus)", () => {
    it("undo dispatches the stored inverse operation to content", () => {
      const dispatched: Operation[] = [];
      const cleared: boolean[] = [];
      const { result } = renderHook(() =>
        useJournal({
          dispatchOperation: (op) => dispatched.push(op),
          dispatchClear: () => cleared.push(true),
        }),
      );

      act(() => {
        result.current.record(styleEdit("op-dispatch-001", "blue", "red"));
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]?.id).not.toBe("op-dispatch-001");
      expect((dispatched[0] as { inverseOf?: string }).inverseOf).toBe("op-dispatch-001");
      expect((dispatched[0] as { value: string }).value).toBe("red");
    });

    it("redo dispatches the original operation to content", () => {
      const dispatched: Operation[] = [];
      const { result } = renderHook(() =>
        useJournal({ dispatchOperation: (op) => dispatched.push(op) }),
      );

      act(() => {
        result.current.record(styleEdit("op-dispatch-002", "blue", "red"));
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
      expect(dispatched).toHaveLength(2);
      expect((dispatched[1] as { id: string }).id).toBe("op-dispatch-002");
    });

    it("clear dispatches a clear-preview signal and empties the journal", () => {
      const cleared: boolean[] = [];
      const { result } = renderHook(() => useJournal({ dispatchClear: () => cleared.push(true) }));

      act(() => {
        result.current.record(styleEdit("op-dispatch-003", "blue"));
      });
      act(() => {
        result.current.clear();
      });

      expect(result.current.entries).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(cleared).toEqual([true]);
    });

    it("record does not dispatch (App.handleEditorCommand owns the apply dispatch)", () => {
      const dispatched: Operation[] = [];
      const { result } = renderHook(() =>
        useJournal({ dispatchOperation: (op) => dispatched.push(op) }),
      );

      act(() => {
        result.current.record(styleEdit("op-dispatch-004", "blue"));
      });

      expect(dispatched).toHaveLength(0);
      expect(result.current.entries).toHaveLength(1);
    });

    it("undo with no preview engine and no dispatch still updates journal state", () => {
      const { result } = renderHook(() => useJournal({}));

      act(() => {
        result.current.record(styleEdit("op-dispatch-005", "blue", "red"));
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
      expect(result.current.entries[0]?.status).toBe("reverted");
    });
  });
});

import type { Operation } from "@vision-control/change-ir";
import type {
  PreviewManager,
  PreviewTransaction,
  StylesheetManager,
  TransactionState,
} from "@vision-control/preview-engine";

export const BASE_TIME = 1_700_000_000_000;

export function styleEdit(id: string, value: string, previousValue = "red"): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId: "btn-1" },
    property: "color",
    value,
    important: false,
    previousValue,
  };
}

export interface FakePreviewState {
  readonly applied: readonly Operation[];
  readonly attempted: readonly Operation[];
  readonly cleared: boolean;
}

export function makeFakePreviewManager(failCommit = false): {
  readonly manager: PreviewManager;
  readonly state: () => FakePreviewState;
  readonly failNextApply: () => void;
  readonly failNextCommit: () => void;
} {
  const applied: Operation[] = [];
  const attempted: Operation[] = [];
  let cleared = false;
  let failure: "apply" | "commit" | undefined = failCommit ? "apply" : undefined;
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
      const operations: Operation[] = [];
      const appliedBeforeTransaction = applied.length;
      let transactionState: TransactionState = "pending";
      const transaction: PreviewTransaction = {
        id: "tx-fake-0000",
        get state(): TransactionState {
          return transactionState;
        },
        get operations() {
          return operations;
        },
        hasRuntimeMutation: () => false,
        begin: () => {
          transactionState = "applying";
        },
        apply: (operation) => {
          attempted.push(operation);
          if (failure === "apply") {
            failure = undefined;
            throw new Error("apply failed");
          }
          applied.push(operation);
          operations.push(operation);
          transactionState = "applied";
          return transaction;
        },
        rollback: () => {
          applied.length = appliedBeforeTransaction;
          transactionState = "rolled-back";
        },
        commit: () => {
          if (failure === "commit") {
            failure = undefined;
            throw new Error("commit failed");
          }
          transactionState = "committed";
        },
      };
      return transaction;
    },
    applyOperation: () => () => {},
    applyTransform: () => () => {},
    clearAll: () => {
      cleared = true;
      applied.length = 0;
    },
  };
  return {
    manager,
    state: () => ({ applied: [...applied], attempted: [...attempted], cleared }),
    failNextApply: () => {
      failure = "apply";
    },
    failNextCommit: () => {
      failure = "commit";
    },
  };
}

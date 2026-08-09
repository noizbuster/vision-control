/**
 * Preview transactions: atomic groups of preview operations with a
 * begin/apply/rollback/commit lifecycle.
 *
 * Lifecycle:
 *   pending → (begin) → applying → (apply ×N) → applied
 *                                        ↘ (rollback) → rolling-back → rolled-back
 *                                        ↘ (commit) → committed
 *
 * `rollback()` undoes ALL operations in the transaction atomically (reverse
 * order). `commit()` finalizes the transaction: the operations stay applied
 * but are no longer in a "preview" transaction — a new transaction can begin.
 * `clearAll()` on the PreviewManager still rolls back committed previews.
 */

import type { Operation } from "@vision-control/change-ir";

export type TransactionState =
  | "pending"
  | "applying"
  | "applied"
  | "rolling-back"
  | "rolled-back"
  | "committed";

export class TransactionStateError extends Error {
  constructor(
    readonly currentState: TransactionState,
    readonly attemptedAction: string,
  ) {
    super(`Cannot ${attemptedAction} a transaction in state "${currentState}"`);
    this.name = "TransactionStateError";
  }
}

export interface PreviewTransaction {
  readonly id: string;
  readonly state: TransactionState;
  readonly operations: readonly Operation[];
  /** Whether any operation in this transaction has runtime:true. */
  readonly hasRuntimeMutation: () => boolean;
  /** Open the transaction for applying operations. */
  readonly begin: () => void;
  /** Apply a single operation. Returns this for chaining. */
  readonly apply: (operation: Operation) => PreviewTransaction;
  /** Undo all applied operations in reverse order. Terminal. */
  readonly rollback: () => void;
  /** Finalize the transaction. Operations stay applied. Terminal. */
  readonly commit: () => void;
}

export interface TransactionCallbacks {
  /** Dispatch an operation to the adapter layer. Returns a rollback function. */
  readonly dispatch: (operation: Operation) => () => void;
}

export function createPreviewTransaction(
  id: string,
  callbacks: TransactionCallbacks,
): PreviewTransaction {
  let state: TransactionState = "pending";
  const operations: Operation[] = [];
  const rollbacks: Array<() => void> = [];

  const assertState = (action: string, ...allowed: TransactionState[]): void => {
    if (!allowed.includes(state)) {
      throw new TransactionStateError(state, action);
    }
  };

  const begin = (): void => {
    assertState("begin", "pending");
    state = "applying";
  };

  const apply = (operation: Operation): PreviewTransaction => {
    assertState("apply", "applying", "applied");
    const rollback = callbacks.dispatch(operation);
    rollbacks.push(rollback);
    operations.push(operation);
    state = "applied";
    return tx;
  };

  const rollback = (): void => {
    assertState("rollback", "applying", "applied");
    state = "rolling-back";
    let firstFailure: unknown;
    let hasFailure = false;
    for (let index = rollbacks.length - 1; index >= 0; index -= 1) {
      const rollbackFn = rollbacks[index];
      if (rollbackFn === undefined) continue;
      try {
        rollbackFn();
      } catch (error) {
        if (!hasFailure) {
          hasFailure = true;
          firstFailure = error;
        }
      }
    }
    rollbacks.length = 0;
    state = "rolled-back";
    if (hasFailure) throw firstFailure;
  };

  const commit = (): void => {
    assertState("commit", "applying", "applied");
    state = "committed";
  };

  const hasRuntimeMutation = (): boolean => operations.some((op) => op.runtime === true);

  const tx: PreviewTransaction = {
    id,
    get state() {
      return state;
    },
    get operations() {
      return operations;
    },
    hasRuntimeMutation,
    begin,
    apply,
    rollback,
    commit,
  };

  return tx;
}

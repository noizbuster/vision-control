/**
 * Shared types and helpers for preview adapters.
 */

/** A function that reverses a single preview operation. */
export type RollbackFn = () => void;

/** No-op rollback for operations that could not be applied (element not found). */
export const noopRollback: RollbackFn = (): void => {};

/** Assert that a switch is exhaustive at compile time. */
export function assertNever(value: never): never {
  throw new Error(`Unreachable: unexpected value ${JSON.stringify(value)}`);
}

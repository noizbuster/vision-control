/**
 * Shared types and helpers for preview adapters.
 */

/** A function that reverses a single preview operation. */
export type RollbackFn = () => void;

/** No-op rollback for operations that could not be applied (element not found). */
export const noopRollback: RollbackFn = (): void => {};

/**
 * Typed error thrown when the preview manager receives an operation kind it
 * cannot dispatch. The discriminated union makes this compile-time unreachable
 * for valid {@link Operation} values; the typed error is the runtime backstop
 * for malformed/unversioned payloads and gives callers an `instanceof` hook.
 */
export class UnsupportedPreviewOperationError extends Error {
  readonly kind: string;
  constructor(kind: string) {
    super(`Unsupported preview operation kind: ${kind}`);
    this.name = "UnsupportedPreviewOperationError";
    this.kind = kind;
  }
}

/** Assert that a switch is exhaustive at compile time. */
export function assertNever(value: never): never {
  throw new Error(`Unreachable: unexpected value ${JSON.stringify(value)}`);
}

import { createOperationId } from "./operation-base.js";
import type { Operation } from "./operations/index.js";

export const inverseBase = (operation: Operation) => ({
  id: createOperationId(),
  inverseOf: operation.id,
  timestamp: Date.now(),
  runtime: operation.runtime,
  origin: operation.origin,
  ...(operation.breakpoint !== undefined ? { breakpoint: operation.breakpoint } : {}),
  ...(operation.pseudoState !== undefined ? { pseudoState: operation.pseudoState } : {}),
  ...(operation.notes !== undefined ? { notes: operation.notes } : {}),
});

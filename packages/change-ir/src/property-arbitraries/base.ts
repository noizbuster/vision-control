import * as fc from "fast-check";

import type { Operation } from "../operations/index.js";
import { OperationSchema } from "../operations/index.js";

export const arbSafeId = fc.stringMatching(/^[a-z0-9_-]{8,20}$/);
export const arbRuntimeId = fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/);
export const arbIdent = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/);
export const arbNonEmpty = fc.stringMatching(/^[a-z0-9 _-]{1,20}$/);
export const arbText = fc.string({ minLength: 0, maxLength: 40 });
export const arbBool = fc.boolean();
export const arbNat = fc.nat({ max: 50 });
export const arbPosInt = fc.integer({ min: 1, max: 12 });
export const arbTimestamp = fc.nat({ max: 4_000_000_000_000 });
export const arbOrigin = fc.constantFrom("property-panel", "canvas-drag", "shortcut", "agent");
export const arbConfidence = fc.float({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});
export const arbElementRef = fc.record({
  runtimeId: arbRuntimeId,
  sourceId: fc.option(arbRuntimeId, { nil: undefined }),
  selector: fc.option(arbRuntimeId, { nil: undefined }),
});
export const arbElementRefs1 = fc.uniqueArray(arbElementRef, { minLength: 1, maxLength: 4 });
export const arbElementRefs2 = fc.uniqueArray(arbElementRef, { minLength: 2, maxLength: 4 });

export const operationBase = {
  id: arbSafeId,
  timestamp: arbTimestamp,
  runtime: arbBool,
  origin: arbOrigin,
  confidence: arbConfidence,
};

export const parseOperation = (raw: unknown): Operation => OperationSchema.parse(raw);

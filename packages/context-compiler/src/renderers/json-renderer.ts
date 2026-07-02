/**
 * JSON renderer for a compiled context.
 *
 * Produces deterministic, pretty-printed JSON. Determinism comes from stable
 * object key insertion order (the schema fields), so the output is safe for
 * snapshotting. Callers MUST pass an already-redacted context.
 */

import type { CompiledContext } from "../context-schema.js";

export const renderJson = (context: CompiledContext): string => JSON.stringify(context, null, 2);

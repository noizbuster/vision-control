/**
 * @vision-control/source-registry — public API.
 *
 * Isomorphic registry that maps opaque, stable source ids (emitted by the
 * dev-only Vite source-marker plugin) to workspace-relative source locations,
 * plus the ephemeral runtime-id layer the content script uses to distinguish
 * repeated DOM instances of one source location.
 *
 * HARD contract: an absolute filesystem path can never enter this module. The
 * boundary schemas in `types.ts` reject it, mirroring the storage layer's
 * guard, so a leak fails loudly at whichever boundary it hits first (PRD 27.1).
 */

export { applyHmrUpdate, type HmrUpdateEvent, type HmrUpdateResult } from "./hmr-updates.js";
export { SourceRegistry } from "./registry.js";
export {
  type AttributedElement,
  assignRuntimeIds,
  isUuid,
  RUNTIME_ATTRIBUTE,
  type RuntimeAssignment,
  SOURCE_ATTRIBUTE,
} from "./runtime-id-assignment.js";
export {
  createSourceEntry,
  isAbsolutePath,
  type SerializedSourceRegistry,
  SerializedSourceRegistrySchema,
  type SourceEntry,
  SourceEntrySchema,
  type SourceRange,
  SourceRangeSchema,
} from "./types.js";

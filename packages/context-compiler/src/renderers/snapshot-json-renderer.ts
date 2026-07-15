/**
 * JSON renderer for a portable {@link VisionContextSnapshot}.
 *
 * Produces deterministic, pretty-printed JSON. Callers MUST pass a snapshot
 * already produced by {@link compileVisionContextSnapshot} (always redacted).
 */

import type { VisionContextSnapshot } from "../snapshot-schema.js";

export const renderSnapshotJson = (snapshot: VisionContextSnapshot): string =>
  JSON.stringify(snapshot, null, 2);

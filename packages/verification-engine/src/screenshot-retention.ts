/**
 * Screenshot artifact retention + cleanup (VC-V1V2-15 / ADR-011).
 *
 * ADR-011 answers PRD open question 6 (retention period) with a conservative
 * local default, not an indefinite one. This module owns the policy (default
 * retention window, expiry computation) and the cleanup sweep that expires +
 * deletes artifacts past retention.
 *
 * The sweep runs against a structural {@link RetentionSweepRepository}
 * interface, NOT the node-only storage package, so verification-engine stays
 * isomorphic. `ScreenshotArtifactRepository.cleanupExpired` satisfies this
 * interface structurally (D15 decoupling).
 */

/** Default short local retention: 24 hours. */
export const DEFAULT_SCREENSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** A retention window. */
export interface RetentionPolicy {
  readonly retentionMs: number;
}

/** The default 24h policy. */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  retentionMs: DEFAULT_SCREENSHOT_RETENTION_MS,
};

/**
 * Compute the expiry timestamp for an artifact captured at `capturedAt`. With
 * the default policy this is `capturedAt + 24h`. A negative window is rejected.
 */
export function computeExpiry(
  capturedAt: number,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): number {
  if (policy.retentionMs < 0) {
    throw new Error(`retentionMs must be non-negative, got ${policy.retentionMs}`);
  }
  return capturedAt + policy.retentionMs;
}

/** A row the sweep reads from the repository (id + workspace-relative path). */
export interface RetentionSweepRow {
  readonly id: string;
  readonly file_path: string;
}

/**
 * Structural repository interface for the sweep. The storage
 * `ScreenshotArtifactRepository` satisfies this shape (its `listExpired`
 * returns `ScreenshotArtifactRow[]` which carry `id` + `file_path`, and it has
 * `delete(id)`). No import from storage — keeps this package isomorphic.
 */
export interface RetentionSweepRepository {
  listExpired(now: number): readonly RetentionSweepRow[];
  delete(id: string): void;
}

/** Result of one cleanup sweep. */
export interface RetentionCleanupResult {
  readonly deletedCount: number;
  readonly deletedIds: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly failedDeletes: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * Expire + delete artifacts past retention. For each expired row the file
 * deleter is called first (filesystem artifact), then the row is deleted. A
 * failed file delete is recorded in `failedDeletes` and does NOT abort the rest
 * of the sweep; the row is left in place so a future sweep can retry.
 */
export function runRetentionCleanup(
  repo: RetentionSweepRepository,
  now: number,
  deleteFile: (filePath: string) => void,
): RetentionCleanupResult {
  const expired = repo.listExpired(now);
  const deletedIds: string[] = [];
  const deletedPaths: string[] = [];
  const failedDeletes: { id: string; reason: string }[] = [];
  for (const row of expired) {
    try {
      deleteFile(row.file_path);
    } catch (err) {
      failedDeletes.push({
        id: row.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    repo.delete(row.id);
    deletedIds.push(row.id);
    deletedPaths.push(row.file_path);
  }
  return { deletedCount: deletedIds.length, deletedIds, deletedPaths, failedDeletes };
}

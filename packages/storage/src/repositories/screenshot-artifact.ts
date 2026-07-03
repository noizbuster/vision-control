import type Database from "better-sqlite3";
import { z } from "zod";
import type { ScreenshotArtifactRow } from "../schema.js";

/**
 * Zod guard that rejects absolute paths for screenshot artifact storage. Mirrors
 * `source-registry.ts`'s `WorkspaceRelativePathSchema`: a leading `/` or `\`, or
 * a Windows drive-letter prefix, fails validation at the repository boundary so
 * no absolute path is ever persisted (security-privacy.md source-path invariant).
 */
const ScreenshotFilePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:[\\/]/.test(value),
    "file_path must be workspace-relative, never absolute",
  );

export interface ScreenshotArtifactInsert {
  readonly id: string;
  readonly workspace_id: string;
  readonly content_hash: string;
  /** Workspace-relative path. Absolute paths raise a ZodError. */
  readonly file_path: string;
  readonly captured_at: number;
  readonly expires_at?: number;
  readonly redaction_report?: unknown;
  readonly redaction_report_json?: string;
}

/**
 * Repository for the V1 `screenshot_artifacts` table. The blob lives on the
 * filesystem; this stores only metadata behind an opt-in retention/masking
 * policy (ADR-011). `file_path` is validated workspace-relative on every insert.
 */
export class ScreenshotArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: ScreenshotArtifactInsert): void {
    const filePath = ScreenshotFilePathSchema.parse(input.file_path);
    this.db
      .prepare(
        "INSERT INTO screenshot_artifacts (id, workspace_id, content_hash, file_path, captured_at, expires_at, redaction_report_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.workspace_id,
        input.content_hash,
        filePath,
        input.captured_at,
        input.expires_at ?? null,
        input.redaction_report_json ??
          (input.redaction_report !== undefined ? JSON.stringify(input.redaction_report) : "{}"),
      );
  }

  findById(id: string): ScreenshotArtifactRow | undefined {
    return this.db.prepare("SELECT * FROM screenshot_artifacts WHERE id = ?").get(id) as
      | ScreenshotArtifactRow
      | undefined;
  }

  listByWorkspace(workspaceId: string): readonly ScreenshotArtifactRow[] {
    return this.db
      .prepare("SELECT * FROM screenshot_artifacts WHERE workspace_id = ? ORDER BY captured_at")
      .all(workspaceId) as ScreenshotArtifactRow[];
  }

  /** Rows whose retention has expired (for cleanup sweeps). */
  listExpired(now: number): readonly ScreenshotArtifactRow[] {
    return this.db
      .prepare(
        "SELECT * FROM screenshot_artifacts WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at",
      )
      .all(now) as ScreenshotArtifactRow[];
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM screenshot_artifacts WHERE id = ?").run(id);
  }

  /**
   * One-shot retention cleanup (VC-V1V2-15 / ADR-011): for every expired row,
   * invoke `deleteFile` with its workspace-relative path (so the caller removes
   * the on-disk blob), then delete the row. Returns the deleted rows in
   * expiry order. A thrown `deleteFile` aborts ONLY that row — the row stays so
   * a future sweep can retry, matching {@link runRetentionCleanup} semantics in
   * the verification engine.
   */
  cleanupExpired(
    now: number,
    deleteFile: (filePath: string) => void,
  ): readonly ScreenshotArtifactRow[] {
    const expired = this.listExpired(now);
    const deleted: ScreenshotArtifactRow[] = [];
    for (const row of expired) {
      deleteFile(row.file_path);
      this.delete(row.id);
      deleted.push(row);
    }
    return deleted;
  }
}

import type Database from "better-sqlite3";
import { z } from "zod";
import type { SourceRange, SourceRegistryRow } from "../schema.js";

/**
 * Zod guard that rejects absolute paths. Workspace-relative only: a leading `/`
 * or `\`, or a Windows drive-letter prefix (`C:\`, `D:/`), fails validation at
 * the repository boundary before any INSERT reaches SQLite. This is the single
 * enforcement point for PRD §27.1 / security-privacy.md ("source path is never
 * exposed to the browser DOM").
 */
const WorkspaceRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:[\\/]/.test(value),
    "file_path must be workspace-relative, never absolute",
  );

export interface SourceRegistryInsert {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_id: string;
  /** Workspace-relative path. Absolute paths raise a ZodError. */
  readonly file_path: string;
  readonly range: SourceRange;
  readonly fingerprint: string;
  readonly component_name?: string;
  readonly captured_at: number;
}

/**
 * Repository for the `source_registry` table.
 *
 * The `file_path` is validated against {@link WorkspaceRelativePathSchema} on
 * every insert/update so no absolute path is ever persisted. Callers pass the
 * `range` as a typed {@link SourceRange}; the repository serializes it.
 */
export class SourceRegistryRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: SourceRegistryInsert): void {
    const filePath = WorkspaceRelativePathSchema.parse(input.file_path);
    this.db
      .prepare(
        "INSERT INTO source_registry (id, workspace_id, source_id, file_path, range_json, fingerprint, component_name, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.workspace_id,
        input.source_id,
        filePath,
        JSON.stringify(input.range),
        input.fingerprint,
        input.component_name ?? null,
        input.captured_at,
      );
  }

  findById(id: string): SourceRegistryRow | undefined {
    return this.db.prepare("SELECT * FROM source_registry WHERE id = ?").get(id) as
      | SourceRegistryRow
      | undefined;
  }

  findBySourceId(sourceId: string): SourceRegistryRow | undefined {
    return this.db.prepare("SELECT * FROM source_registry WHERE source_id = ?").get(sourceId) as
      | SourceRegistryRow
      | undefined;
  }

  listByWorkspace(workspaceId: string): readonly SourceRegistryRow[] {
    return this.db
      .prepare("SELECT * FROM source_registry WHERE workspace_id = ? ORDER BY captured_at")
      .all(workspaceId) as SourceRegistryRow[];
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM source_registry WHERE id = ?").run(id);
  }
}

/** Re-exported so tests can assert the validation rule directly. */
export const isWorkspaceRelativePath = (value: string): boolean =>
  WorkspaceRelativePathSchema.safeParse(value).success;

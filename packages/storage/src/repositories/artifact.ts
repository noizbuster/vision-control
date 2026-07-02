import type Database from "better-sqlite3";
import type { ArtifactRow } from "../schema.js";

export interface ArtifactInsert {
  readonly id: string;
  readonly workspace_id: string;
  readonly kind: string;
  readonly path: string;
  readonly metadata_json?: string;
  readonly metadata?: unknown;
  readonly created_at: number;
}

/** Repository for the `artifacts` table (binary artifacts' metadata). */
export class ArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: ArtifactInsert): void {
    this.db
      .prepare(
        "INSERT INTO artifacts (id, workspace_id, kind, path, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.workspace_id,
        input.kind,
        input.path,
        input.metadata_json ?? (input.metadata ? JSON.stringify(input.metadata) : "{}"),
        input.created_at,
      );
  }

  findById(id: string): ArtifactRow | undefined {
    return this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as
      | ArtifactRow
      | undefined;
  }

  listByWorkspace(workspaceId: string): readonly ArtifactRow[] {
    return this.db
      .prepare("SELECT * FROM artifacts WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as ArtifactRow[];
  }

  listByKind(workspaceId: string, kind: string): readonly ArtifactRow[] {
    return this.db
      .prepare("SELECT * FROM artifacts WHERE workspace_id = ? AND kind = ? ORDER BY created_at")
      .all(workspaceId, kind) as ArtifactRow[];
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }
}

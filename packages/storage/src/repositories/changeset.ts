import type Database from "better-sqlite3";
import type { ChangesetRow } from "../schema.js";

export interface ChangesetInsert {
  readonly id: string;
  readonly session_id: string;
  readonly workspace_id: string;
  /** Operations serialized to JSON by the caller or as `operations`. */
  readonly operations_json?: string;
  readonly operations?: readonly unknown[];
  readonly committed?: boolean;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface ChangesetUpdate {
  readonly operations_json?: string;
  readonly operations?: readonly unknown[];
  readonly committed?: boolean;
  readonly superseded_by?: string | null;
  readonly updated_at: number;
}

/** Repository for the `changesets` table. Booleans map to INTEGER 0/1. */
export class ChangesetRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: ChangesetInsert): void {
    this.db
      .prepare(
        "INSERT INTO changesets (id, session_id, workspace_id, operations_json, committed, superseded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.session_id,
        input.workspace_id,
        input.operations_json ?? (input.operations ? JSON.stringify(input.operations) : "[]"),
        input.committed ? 1 : 0,
        null,
        input.created_at,
        input.updated_at,
      );
  }

  findById(id: string): ChangesetRow | undefined {
    return this.db.prepare("SELECT * FROM changesets WHERE id = ?").get(id) as
      | ChangesetRow
      | undefined;
  }

  listBySession(sessionId: string): readonly ChangesetRow[] {
    return this.db
      .prepare("SELECT * FROM changesets WHERE session_id = ? ORDER BY created_at")
      .all(sessionId) as ChangesetRow[];
  }

  listByWorkspace(workspaceId: string): readonly ChangesetRow[] {
    return this.db
      .prepare("SELECT * FROM changesets WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as ChangesetRow[];
  }

  update(id: string, input: ChangesetUpdate): void {
    const current = this.findById(id);
    if (current === undefined) {
      return;
    }
    this.db
      .prepare(
        "UPDATE changesets SET operations_json = ?, committed = ?, superseded_by = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        input.operations_json ??
          (input.operations ? JSON.stringify(input.operations) : current.operations_json),
        (input.committed ?? current.committed === 1) ? 1 : 0,
        input.superseded_by !== undefined ? input.superseded_by : current.superseded_by,
        input.updated_at,
        id,
      );
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM changesets WHERE id = ?").run(id);
  }
}

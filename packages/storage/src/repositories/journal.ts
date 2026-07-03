import type Database from "better-sqlite3";
import type { JournalRow } from "../schema.js";

export interface JournalInsert {
  readonly id: string;
  readonly changeset_id: string;
  readonly operation: unknown;
  readonly status: string;
  readonly applied_at?: number;
  /** V1: breakpoint identifier for breakpoint-scoped entries. */
  readonly breakpoint?: string;
  /** V1: inert suggested-diff payload (serialized when `suggested_diff` is given). */
  readonly suggested_diff?: unknown;
  readonly suggested_diff_json?: string;
}

/** Repository for the `journal` table (undo/redo entries). */
export class JournalRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: JournalInsert): void {
    this.db
      .prepare(
        "INSERT INTO journal (id, changeset_id, operation_json, status, applied_at, breakpoint, suggested_diff_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.changeset_id,
        JSON.stringify(input.operation),
        input.status,
        input.applied_at ?? null,
        input.breakpoint ?? null,
        input.suggested_diff_json ??
          (input.suggested_diff !== undefined ? JSON.stringify(input.suggested_diff) : null),
      );
  }

  findById(id: string): JournalRow | undefined {
    return this.db.prepare("SELECT * FROM journal WHERE id = ?").get(id) as JournalRow | undefined;
  }

  listByChangeset(changesetId: string): readonly JournalRow[] {
    return this.db
      .prepare("SELECT * FROM journal WHERE changeset_id = ? ORDER BY id")
      .all(changesetId) as JournalRow[];
  }

  markApplied(id: string, status: string, appliedAt: number): void {
    this.db
      .prepare("UPDATE journal SET status = ?, applied_at = ? WHERE id = ?")
      .run(status, appliedAt, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM journal WHERE id = ?").run(id);
  }
}

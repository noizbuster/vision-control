import type Database from "better-sqlite3";
import type { VerificationRow } from "../schema.js";

export interface VerificationInsert {
  readonly id: string;
  readonly session_id: string;
  readonly changeset_id: string;
  /** Verification result serialized by the caller or via `result`. */
  readonly result_json?: string;
  readonly result?: unknown;
  readonly captured_at: number;
}

/** Repository for the `verification` table (HMR assertion outcomes). */
export class VerificationRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: VerificationInsert): void {
    this.db
      .prepare(
        "INSERT INTO verification (id, session_id, changeset_id, result_json, captured_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.session_id,
        input.changeset_id,
        input.result_json ?? (input.result ? JSON.stringify(input.result) : "{}"),
        input.captured_at,
      );
  }

  findById(id: string): VerificationRow | undefined {
    return this.db.prepare("SELECT * FROM verification WHERE id = ?").get(id) as
      | VerificationRow
      | undefined;
  }

  findByChangeset(changesetId: string): VerificationRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM verification WHERE changeset_id = ? ORDER BY captured_at DESC LIMIT 1",
      )
      .get(changesetId) as VerificationRow | undefined;
  }

  listByChangeset(changesetId: string): readonly VerificationRow[] {
    return this.db
      .prepare("SELECT * FROM verification WHERE changeset_id = ? ORDER BY captured_at")
      .all(changesetId) as VerificationRow[];
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM verification WHERE id = ?").run(id);
  }
}

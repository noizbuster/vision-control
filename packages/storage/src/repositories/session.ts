import type Database from "better-sqlite3";
import type { SessionRow } from "../schema.js";

/** Fields a caller supplies when creating a session. */
export interface SessionInsert {
  readonly id: string;
  readonly workspace_id: string;
  /** SHA-256 of the raw pairing token — the raw token is never stored. */
  readonly token_hash: string;
  readonly origin: string;
  readonly created_at: number;
  readonly expires_at: number;
  readonly last_active_at: number;
}

/** CRUD + auth queries for the `sessions` table. */
export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: SessionInsert): void {
    this.db
      .prepare(
        "INSERT INTO sessions (id, workspace_id, token_hash, origin, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.workspace_id,
        input.token_hash,
        input.origin,
        input.created_at,
        input.expires_at,
        input.last_active_at,
      );
  }

  findById(id: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  }

  findByTokenHash(tokenHash: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash) as
      | SessionRow
      | undefined;
  }

  listByWorkspace(workspaceId: string): readonly SessionRow[] {
    return this.db
      .prepare("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as SessionRow[];
  }

  touch(id: string, lastActiveAt: number): void {
    this.db.prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?").run(lastActiveAt, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
}

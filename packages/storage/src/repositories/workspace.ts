import type Database from "better-sqlite3";
import type { WorkspaceRow } from "../schema.js";

/** Fields a caller supplies when creating a workspace. `id` is caller-generated. */
export interface WorkspaceInsert {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly config_json?: string;
  readonly created_at: number;
  readonly updated_at: number;
}

/** Fields that may change on a workspace update. */
export interface WorkspaceUpdate {
  readonly path?: string;
  readonly name?: string;
  readonly config_json?: string;
  readonly updated_at: number;
}

/** CRUD for the `workspaces` table. */
export class WorkspaceRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: WorkspaceInsert): void {
    this.db
      .prepare(
        "INSERT INTO workspaces (id, path, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.path,
        input.name,
        input.config_json ?? "{}",
        input.created_at,
        input.updated_at,
      );
  }

  findById(id: string): WorkspaceRow | undefined {
    return this.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
      | WorkspaceRow
      | undefined;
  }

  findByPath(path: string): WorkspaceRow | undefined {
    return this.db.prepare("SELECT * FROM workspaces WHERE path = ?").get(path) as
      | WorkspaceRow
      | undefined;
  }

  list(): readonly WorkspaceRow[] {
    return this.db.prepare("SELECT * FROM workspaces ORDER BY created_at").all() as WorkspaceRow[];
  }

  update(id: string, input: WorkspaceUpdate): void {
    const current = this.findById(id);
    if (current === undefined) {
      return;
    }
    this.db
      .prepare(
        "UPDATE workspaces SET path = ?, name = ?, config_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        input.path ?? current.path,
        input.name ?? current.name,
        input.config_json ?? current.config_json,
        input.updated_at,
        id,
      );
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  }
}

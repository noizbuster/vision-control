import type Database from "better-sqlite3";
import type { AuditRow } from "../schema.js";

export interface AuditInsert {
  readonly id: string;
  readonly workspace_id: string;
  /** Audit event serialized by the caller or via `event`. */
  readonly event_json?: string;
  readonly event?: unknown;
  readonly created_at: number;
}

/**
 * Error thrown when a caller attempts to mutate the audit log. Audit events are
 * append-only (security-privacy.md#audit-logging); there is intentionally no
 * `update` or `delete` path.
 */
export class AuditEventImmutableError extends Error {
  constructor(public readonly operation: "update" | "delete") {
    super(`Audit events are append-only; '${operation}' is not permitted.`);
    this.name = "AuditEventImmutableError";
  }
}

/**
 * Append-only repository for the `audit` table.
 *
 * Only {@link insert} and read methods exist. {@link update} and {@link delete}
 * exist solely to throw {@link AuditEventImmutableError}, making immutability
 * explicit and testable at the type boundary.
 */
export class AuditRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: AuditInsert): void {
    this.db
      .prepare("INSERT INTO audit (id, workspace_id, event_json, created_at) VALUES (?, ?, ?, ?)")
      .run(
        input.id,
        input.workspace_id,
        input.event_json ?? JSON.stringify(input.event ?? {}),
        input.created_at,
      );
  }

  findById(id: string): AuditRow | undefined {
    return this.db.prepare("SELECT * FROM audit WHERE id = ?").get(id) as AuditRow | undefined;
  }

  listByWorkspace(workspaceId: string): readonly AuditRow[] {
    return this.db
      .prepare("SELECT * FROM audit WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as AuditRow[];
  }

  /** Always throws: audit events are immutable. */
  update(): never {
    throw new AuditEventImmutableError("update");
  }

  /** Always throws: audit events are immutable. */
  delete(): never {
    throw new AuditEventImmutableError("delete");
  }
}

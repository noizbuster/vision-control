import type Database from "better-sqlite3";
import { z } from "zod";
import type { ShareBundleRow } from "../schema.js";

/**
 * Zod guard for the `kind` column. `export` = a bundle this workspace
 * produced; `import` = a bundle this workspace consumed. Closed enum so an
 * unknown kind is rejected at the repository boundary.
 */
export const ShareBundleKindSchema = z.enum(["export", "import"]);
export type ShareBundleKind = z.infer<typeof ShareBundleKindSchema>;

export interface ShareBundleInsert {
  readonly id: string;
  readonly workspace_id: string;
  readonly bundle_hash: string;
  readonly kind: ShareBundleKind;
  /** Optional local filesystem path where the bundle bytes live (workspace-relative). */
  readonly local_path?: string;
  readonly created_at: number;
  /** Optional expiry (ms epoch); NULL means no expiry. */
  readonly expires_at?: number;
}

/**
 * Repository for the V2 `share_bundles` table (ADR-015 / ADR-018).
 *
 * Persists METADATA about exported/imported share bundles ONLY — never the
 * bundle bytes, never a token, secret, or image. The bundle is a local file the
 * caller writes out of band; this table records its content hash, kind, optional
 * local path, and expiry so a workspace can audit its local shares and revoke
 * (delete) them. There is intentionally no `update`: a bundle record is
 * immutable once written (audit-surface discipline, mirroring `AuditRepository`).
 */
export class ShareBundleRepository {
  constructor(private readonly db: Database.Database) {}

  insert(input: ShareBundleInsert): void {
    const kind = ShareBundleKindSchema.parse(input.kind);
    this.db
      .prepare(
        "INSERT INTO share_bundles (id, workspace_id, bundle_hash, kind, local_path, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.workspace_id,
        input.bundle_hash,
        kind,
        input.local_path ?? null,
        input.created_at,
        input.expires_at ?? null,
      );
  }

  findById(id: string): ShareBundleRow | undefined {
    return this.db.prepare("SELECT * FROM share_bundles WHERE id = ?").get(id) as
      | ShareBundleRow
      | undefined;
  }

  listByWorkspace(workspaceId: string): readonly ShareBundleRow[] {
    return this.db
      .prepare("SELECT * FROM share_bundles WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as ShareBundleRow[];
  }

  /** Rows whose retention has expired (for cleanup / revoke sweeps). */
  listExpired(now: number): readonly ShareBundleRow[] {
    return this.db
      .prepare(
        "SELECT * FROM share_bundles WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at",
      )
      .all(now) as ShareBundleRow[];
  }

  /** Revoke a local share by deleting its metadata row (the bytes stay on disk). */
  delete(id: string): void {
    this.db.prepare("DELETE FROM share_bundles WHERE id = ?").run(id);
  }
}

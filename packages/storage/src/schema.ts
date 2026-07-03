/**
 * Typed row interfaces for every storage table.
 *
 * These mirror the SQL schemas in `src/migrations/`. SQLite booleans are stored
 * as INTEGER (0/1) and exposed here as `boolean` via repository mapping; the raw
 * row interfaces keep the on-disk shape for low-level queries.
 */

/** Boolean-as-stored (0/1). Repositories convert to/from `boolean`. */
export type SqliteBoolean = 0 | 1;

/** A `[startLine, startColumn, endLine, endColumn]`-shaped source range. */
export interface SourceRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface WorkspaceRow {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly config_json: string;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface SessionRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly token_hash: string;
  readonly origin: string;
  readonly created_at: number;
  readonly expires_at: number;
  readonly last_active_at: number;
}

export interface SourceRegistryRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_id: string;
  /** Workspace-relative path. Absolute paths are rejected before insert. */
  readonly file_path: string;
  readonly range_json: string;
  readonly fingerprint: string;
  readonly component_name: string | null;
  readonly captured_at: number;
}

export interface ChangesetRow {
  readonly id: string;
  readonly session_id: string;
  readonly workspace_id: string;
  readonly operations_json: string;
  readonly committed: SqliteBoolean;
  readonly superseded_by: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  /** V1: JSON array of multi-select element-ref identities (null for single-element changesets). */
  readonly multi_select_targets_json: string | null;
}

export interface JournalRow {
  readonly id: string;
  readonly changeset_id: string;
  readonly operation_json: string;
  readonly status: string;
  readonly applied_at: number | null;
  /** V1: breakpoint identifier for breakpoint-scoped journal entries. */
  readonly breakpoint: string | null;
  /** V1: inert suggested-diff JSON payload for suggested-diff entries. */
  readonly suggested_diff_json: string | null;
}

export interface VerificationRow {
  readonly id: string;
  readonly session_id: string;
  readonly changeset_id: string;
  readonly result_json: string;
  readonly captured_at: number;
}

export interface AuditRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly event_json: string;
  readonly created_at: number;
}

export interface ArtifactRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly kind: string;
  readonly path: string;
  readonly metadata_json: string;
  readonly created_at: number;
}

/** V1: a screenshot crop artifact's metadata. The blob lives on the filesystem. */
export interface ScreenshotArtifactRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly content_hash: string;
  /** Workspace-relative path (validated at the repository boundary). */
  readonly file_path: string;
  readonly captured_at: number;
  /** Retention expiry; NULL means no expiry set. */
  readonly expires_at: number | null;
  readonly redaction_report_json: string;
}

/**
 * V2: metadata about an exported or imported share bundle (ADR-015 / ADR-018).
 * The bundle bytes live on the local filesystem; this row records the content
 * hash, kind (`export`/`import`), optional local path, and optional expiry so a
 * workspace can audit and revoke local shares. No token, secret, or image data
 * is ever stored here.
 */
export interface ShareBundleRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly bundle_hash: string;
  readonly kind: string;
  readonly local_path: string | null;
  readonly created_at: number;
  readonly expires_at: number | null;
}

/** A single applied-migration record from the `_migrations` bookkeeping table. */
export interface MigrationRecord {
  readonly id: string;
  readonly applied_at: number;
}

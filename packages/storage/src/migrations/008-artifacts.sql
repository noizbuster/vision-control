-- 008: Artifacts.
-- Large binary artifacts (screenshots, diffs) live on the filesystem; this
-- table stores only the kind, path, and metadata. Idempotent.
CREATE TABLE IF NOT EXISTS artifacts (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  path            TEXT NOT NULL,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);

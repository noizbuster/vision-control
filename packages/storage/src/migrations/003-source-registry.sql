-- 003: Source registry.
-- Maps an opaque source id (from a dev-only source marker) to a workspace-
-- RELATIVE file path plus a source range. Absolute paths are rejected at the
-- repository layer via Zod (see SourceRegistryRepository) so that no filesystem
-- path is ever persisted. Idempotent.
CREATE TABLE IF NOT EXISTS source_registry (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  range_json      TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  component_name  TEXT,
  captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_registry_workspace ON source_registry(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_registry_source_id ON source_registry(source_id);

-- 010: V2 share-bundle metadata (ADR-015 / ADR-018).
-- Stores METADATA about exported/imported share bundles only. The bundle bytes
-- themselves live on the local filesystem (handed out of band); this table
-- records the content hash, kind, optional local path, and expiry so a
-- workspace can audit and revoke local shares. No token, secret, or image data
-- is ever stored here. Idempotent.

CREATE TABLE IF NOT EXISTS share_bundles (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bundle_hash   TEXT NOT NULL,
  kind          TEXT NOT NULL,
  local_path    TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_share_bundles_workspace ON share_bundles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_share_bundles_expires ON share_bundles(expires_at);

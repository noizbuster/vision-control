-- 007: Audit events.
-- Append-only security audit log (security-privacy.md#audit-logging). The
-- repository layer exposes NO update/delete — events are immutable. Idempotent.
CREATE TABLE IF NOT EXISTS audit (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_json      TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at);

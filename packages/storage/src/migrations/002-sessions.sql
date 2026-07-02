-- 002: Browser sessions.
-- A session authenticates a connected extension to a workspace. Only the token
-- HASH is persisted (PRD §24.2 / security-privacy.md) — the raw pairing token is
-- never stored. Idempotent.
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  origin          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  last_active_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);

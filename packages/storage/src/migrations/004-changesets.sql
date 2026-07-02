-- 004: Changesets.
-- A changeset groups one or more edit operations issued in a session. A
-- changeset is either open, committed, or superseded by a later changeset.
-- Idempotent.
CREATE TABLE IF NOT EXISTS changesets (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  operations_json TEXT NOT NULL DEFAULT '[]',
  committed       INTEGER NOT NULL DEFAULT 0,
  superseded_by   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changesets_session ON changesets(session_id);
CREATE INDEX IF NOT EXISTS idx_changesets_workspace ON changesets(workspace_id);

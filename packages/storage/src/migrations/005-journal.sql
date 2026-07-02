-- 005: Journal entries.
-- The undo/redo journal records each operation applied under a changeset, with
-- its application status. Idempotent.
CREATE TABLE IF NOT EXISTS journal (
  id              TEXT PRIMARY KEY,
  changeset_id    TEXT NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
  operation_json  TEXT NOT NULL,
  status          TEXT NOT NULL,
  applied_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_journal_changeset ON journal(changeset_id);

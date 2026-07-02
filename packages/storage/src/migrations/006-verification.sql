-- 006: Verification runs.
-- Captures the outcome of verifying a changeset against the live source after
-- HMR (PRD §34). Idempotent.
CREATE TABLE IF NOT EXISTS verification (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  changeset_id    TEXT NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
  result_json     TEXT NOT NULL,
  captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_changeset ON verification(changeset_id);

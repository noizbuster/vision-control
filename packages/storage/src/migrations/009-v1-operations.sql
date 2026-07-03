-- 009: V1 operation persistence.
-- Adds columns/tables for V1-capable operation kinds (multi-select, breakpoint,
-- suggested-diff, screenshot artifacts). All additions are nullable/additive so
-- existing changeset/journal rows keep working unchanged. Idempotent.

-- Breakpoint identifier carried on breakpoint-scoped journal entries (e.g. "md"
-- responsive prefix or a named media query). NULL for non-breakpoint ops.
ALTER TABLE journal ADD COLUMN breakpoint TEXT;

-- Inert suggested-diff payload (JSON) for suggested-diff journal entries. Never
-- applied by the runtime or MCP (ADR-012); stored for audit/replay. NULL otherwise.
ALTER TABLE journal ADD COLUMN suggested_diff_json TEXT;

-- Array of multi-select element-ref identities (JSON) for changesets whose
-- primary subject is a multi-select group. NULL for single-element changesets.
ALTER TABLE changesets ADD COLUMN multi_select_targets_json TEXT;

-- Dedicated screenshot artifact table. The blob lives on the filesystem; this
-- table stores only metadata behind an opt-in retention/masking policy (ADR-011).
-- `file_path` is workspace-relative (validated at the repository boundary);
-- `expires_at` drives retention sweeps; `redaction_report_json` records what was
-- masked before the artifact was persisted.
CREATE TABLE IF NOT EXISTS screenshot_artifacts (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_hash         TEXT NOT NULL,
  file_path            TEXT NOT NULL,
  captured_at          INTEGER NOT NULL,
  expires_at           INTEGER,
  redaction_report_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_screenshot_artifacts_workspace ON screenshot_artifacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_artifacts_expires ON screenshot_artifacts(expires_at);

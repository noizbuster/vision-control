-- 001: Workspaces.
-- A workspace is a bound project root the daemon operates on.
-- Idempotent: safe to run repeatedly.
CREATE TABLE IF NOT EXISTS workspaces (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL,
  name         TEXT NOT NULL,
  config_json  TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

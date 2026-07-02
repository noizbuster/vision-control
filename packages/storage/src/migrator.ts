/**
 * SQLite migration runner.
 *
 * Discovers numbered `*.sql` files under `src/migrations/` (copied to
 * `dist/migrations/` by the build target), applies any that have not yet been
 * recorded in the `_migrations` bookkeeping table, and tracks them. Migrations
 * are idempotent (`CREATE TABLE IF NOT EXISTS`) and run in filename order.
 *
 * The runner does NOT own the database connection — the caller passes a
 * `better-sqlite3` `Database` instance. This keeps storage testable with
 * in-memory databases and lets the daemon control connection lifecycle.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import type { MigrationRecord } from "./schema.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** A migration file loaded from disk, ready to apply. */
export interface MigrationFile {
  /** Migration id, the filename without extension (e.g. `001-workspaces`). */
  readonly id: string;
  readonly name: string;
  readonly sql: string;
}

/** Outcome of a single {@link runMigrations} invocation. */
export interface MigrationResult {
  /** Ids applied during this run, in order. */
  readonly applied: readonly string[];
  /** Ids that were already recorded before this run. */
  readonly alreadyApplied: readonly string[];
  /** Total number of migration files discovered. */
  readonly totalMigrations: number;
}

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id          TEXT PRIMARY KEY,
    applied_at  INTEGER NOT NULL
  );
`;

/**
 * Load every `*.sql` migration file from the migrations directory, sorted by
 * filename so `001` runs before `002`, etc. Exposed for inspection/tests.
 */
export const loadMigrationFiles = (): readonly MigrationFile[] => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  return names.map((name) => ({
    id: name.replace(/\.sql$/, ""),
    name,
    sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
  }));
};

/**
 * Apply all pending migrations to `db`. Safe to call repeatedly: a second call
 * is a no-op because every applied migration is recorded in `_migrations`.
 *
 * Each migration runs in its own transaction so a failure rolls back only the
 * offending migration, leaving prior ones intact.
 */
export const runMigrations = (db: Database.Database): MigrationResult => {
  db.exec(MIGRATIONS_TABLE_SQL);

  const appliedRows = db.prepare("SELECT id FROM _migrations").all() as ReadonlyArray<{
    id: string;
  }>;
  const alreadyApplied = new Set(appliedRows.map((row) => row.id));

  const files = loadMigrationFiles();
  const newlyApplied: string[] = [];

  const recordStmt = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");

  const apply = db.transaction((file: MigrationFile) => {
    db.exec(file.sql);
    recordStmt.run(file.id, Date.now());
  });

  for (const file of files) {
    if (alreadyApplied.has(file.id)) {
      continue;
    }
    apply(file);
    newlyApplied.push(file.id);
  }

  return {
    applied: newlyApplied,
    alreadyApplied: [...alreadyApplied],
    totalMigrations: files.length,
  };
};

/**
 * Return the current set of recorded migrations (for diagnostics / doctor).
 */
export const listAppliedMigrations = (db: Database.Database): readonly MigrationRecord[] =>
  db
    .prepare("SELECT id, applied_at FROM _migrations ORDER BY id")
    .all() as ReadonlyArray<MigrationRecord>;

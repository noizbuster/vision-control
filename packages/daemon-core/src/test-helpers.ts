import { NoopLogger } from "@vision-control/logger";
import {
  AuditRepository,
  ChangesetRepository,
  runMigrations,
  SessionRepository,
  SourceRegistryRepository,
  WorkspaceRepository,
} from "@vision-control/storage";
import Database from "better-sqlite3";

export const WORKSPACE_ID = "ws-test";
export const WORKSPACE_ROOT = "/tmp/vc-test-workspace";
export const NOW = 1_700_000_000_000;

/** Fresh in-memory database with all migrations applied and one workspace row. */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  const workspaceRepo = new WorkspaceRepository(db);
  workspaceRepo.insert({
    id: WORKSPACE_ID,
    path: WORKSPACE_ROOT,
    name: "test",
    created_at: NOW,
    updated_at: NOW,
  });
  return db;
}

export function makeRepos(db: Database.Database) {
  return {
    sessionRepo: new SessionRepository(db),
    auditRepo: new AuditRepository(db),
    changesetRepo: new ChangesetRepository(db),
    sourceRepo: new SourceRegistryRepository(db),
    workspaceRepo: new WorkspaceRepository(db),
    logger: new NoopLogger(),
  };
}

let uuidCounter = 0;
export const deterministicUuid = (): string => {
  uuidCounter += 1;
  return `test-uuid-${uuidCounter.toString().padStart(4, "0")}`;
};

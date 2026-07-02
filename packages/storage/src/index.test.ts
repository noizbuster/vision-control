import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArtifactRepository,
  AuditEventImmutableError,
  AuditRepository,
  ChangesetRepository,
  isWorkspaceRelativePath,
  JournalRepository,
  listAppliedMigrations,
  loadMigrationFiles,
  runMigrations,
  SessionRepository,
  SourceRegistryRepository,
  VerificationRepository,
  WorkspaceRepository,
} from "./index.js";

const seedWorkspace = (db: Database.Database, id = "ws-1"): void => {
  new WorkspaceRepository(db).insert({
    id,
    path: "/repo",
    name: "demo",
    created_at: 1000,
    updated_at: 1000,
  });
};

describe("migrations", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("discovers all eight migration files in order", () => {
    const files = loadMigrationFiles();
    expect(files.map((f) => f.id)).toEqual([
      "001-workspaces",
      "002-sessions",
      "003-source-registry",
      "004-changesets",
      "005-journal",
      "006-verification",
      "007-audit",
      "008-artifacts",
    ]);
  });

  it("applies all pending migrations and records them", () => {
    const result = runMigrations(db);
    expect(result.totalMigrations).toBe(8);
    expect(result.applied).toHaveLength(8);
    expect(result.alreadyApplied).toHaveLength(0);
    expect(listAppliedMigrations(db)).toHaveLength(8);
    // Every table now exists.
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as ReadonlyArray<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "_migrations",
        "workspaces",
        "sessions",
        "source_registry",
        "changesets",
        "journal",
        "verification",
        "audit",
        "artifacts",
      ]),
    );
  });

  it("is idempotent: a second run is a no-op", () => {
    const first = runMigrations(db);
    const second = runMigrations(db);
    expect(first.applied).toHaveLength(8);
    expect(second.applied).toHaveLength(0);
    expect(second.alreadyApplied).toHaveLength(8);
    expect(second.totalMigrations).toBe(8);
  });
});

describe("repositories", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    seedWorkspace(db);
  });
  afterEach(() => {
    db.close();
  });

  it("WorkspaceRepository CRUD", () => {
    const repo = new WorkspaceRepository(db);
    const found = repo.findById("ws-1");
    expect(found?.name).toBe("demo");
    repo.update("ws-1", { name: "renamed", updated_at: 2000 });
    expect(repo.findById("ws-1")?.name).toBe("renamed");
    repo.delete("ws-1");
    expect(repo.findById("ws-1")).toBeUndefined();
  });

  it("SessionRepository stores only the token hash and supports lookup", () => {
    const repo = new SessionRepository(db);
    repo.insert({
      id: "sess-1",
      workspace_id: "ws-1",
      token_hash: "deadbeef".repeat(8),
      origin: "chrome-extension://abc",
      created_at: 1,
      expires_at: 2,
      last_active_at: 1,
    });
    expect(repo.findByTokenHash("deadbeef".repeat(8))?.id).toBe("sess-1");
    repo.touch("sess-1", 99);
    expect(repo.findById("sess-1")?.last_active_at).toBe(99);
    // No column ever holds the raw token; only the hash.
    const row = repo.findById("sess-1");
    expect(JSON.stringify(row)).not.toContain("raw-pairing-token");
  });

  it("SourceRegistryRepository rejects absolute paths", () => {
    const repo = new SourceRegistryRepository(db);
    repo.insert({
      id: "src-1",
      workspace_id: "ws-1",
      source_id: "marker-1",
      file_path: "src/components/Button.tsx",
      range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 4 },
      fingerprint: "fp-1",
      component_name: "Button",
      captured_at: 10,
    });
    expect(repo.findBySourceId("marker-1")?.file_path).toBe("src/components/Button.tsx");

    // Absolute POSIX path rejected.
    expect(() =>
      repo.insert({
        id: "src-2",
        workspace_id: "ws-1",
        source_id: "marker-2",
        file_path: "/abs/path.tsx",
        range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0 },
        fingerprint: "fp",
        captured_at: 1,
      }),
    ).toThrow();
    // Windows drive-letter path rejected.
    expect(() =>
      repo.insert({
        id: "src-3",
        workspace_id: "ws-1",
        source_id: "marker-3",
        file_path: "C:\\repo\\file.tsx",
        range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0 },
        fingerprint: "fp",
        captured_at: 1,
      }),
    ).toThrow();
    expect(repo.listByWorkspace("ws-1")).toHaveLength(1);
    expect(isWorkspaceRelativePath("ok/relative.ts")).toBe(true);
    expect(isWorkspaceRelativePath("/nope.ts")).toBe(false);
  });

  it("ChangesetRepository maps booleans and supports supersede", () => {
    const sessions = new SessionRepository(db);
    sessions.insert({
      id: "sess-1",
      workspace_id: "ws-1",
      token_hash: "h",
      origin: "chrome-extension://x",
      created_at: 1,
      expires_at: 2,
      last_active_at: 1,
    });
    const repo = new ChangesetRepository(db);
    repo.insert({
      id: "cs-1",
      session_id: "sess-1",
      workspace_id: "ws-1",
      operations: [{ type: "style", target: "a" }],
      committed: false,
      created_at: 1,
      updated_at: 1,
    });
    expect(repo.findById("cs-1")?.committed).toBe(0);
    repo.update("cs-1", { committed: true, superseded_by: "cs-2", updated_at: 5 });
    const updated = repo.findById("cs-1");
    expect(updated?.committed).toBe(1);
    expect(updated?.superseded_by).toBe("cs-2");
  });

  it("JournalRepository inserts and marks applied", () => {
    const sessions = new SessionRepository(db);
    sessions.insert({
      id: "sess-j",
      workspace_id: "ws-1",
      token_hash: "hj",
      origin: "chrome-extension://x",
      created_at: 1,
      expires_at: 2,
      last_active_at: 1,
    });
    new ChangesetRepository(db).insert({
      id: "cs-j",
      session_id: "sess-j",
      workspace_id: "ws-1",
      created_at: 1,
      updated_at: 1,
    });
    const repo = new JournalRepository(db);
    repo.insert({
      id: "j-1",
      changeset_id: "cs-j",
      operation: { op: "a" },
      status: "pending",
    });
    expect(repo.findById("j-1")?.applied_at).toBeNull();
    repo.markApplied("j-1", "applied", 777);
    expect(repo.findById("j-1")?.applied_at).toBe(777);
    expect(repo.findById("j-1")?.status).toBe("applied");
  });

  it("VerificationRepository stores results", () => {
    const sessions = new SessionRepository(db);
    sessions.insert({
      id: "sess-v",
      workspace_id: "ws-1",
      token_hash: "hv",
      origin: "chrome-extension://x",
      created_at: 1,
      expires_at: 2,
      last_active_at: 1,
    });
    new ChangesetRepository(db).insert({
      id: "cs-v",
      session_id: "sess-v",
      workspace_id: "ws-1",
      created_at: 1,
      updated_at: 1,
    });
    const repo = new VerificationRepository(db);
    repo.insert({
      id: "v-1",
      session_id: "sess-v",
      changeset_id: "cs-v",
      result: { passed: true },
      captured_at: 1,
    });
    expect(repo.findByChangeset("cs-v")?.result_json).toContain("passed");
  });

  it("ArtifactRepository lists by kind", () => {
    const repo = new ArtifactRepository(db);
    repo.insert({
      id: "a-1",
      workspace_id: "ws-1",
      kind: "screenshot",
      path: "shots/1.png",
      created_at: 1,
    });
    repo.insert({
      id: "a-2",
      workspace_id: "ws-1",
      kind: "diff",
      path: "shots/2.diff",
      created_at: 2,
    });
    expect(repo.listByKind("ws-1", "screenshot")).toHaveLength(1);
  });

  it("AuditRepository is append-only: update and delete throw", () => {
    const repo = new AuditRepository(db);
    repo.insert({
      id: "evt-1",
      workspace_id: "ws-1",
      event: { type: "auth", outcome: "success" },
      created_at: 1,
    });
    expect(repo.findById("evt-1")).toBeDefined();
    expect(() => repo.update()).toThrow(AuditEventImmutableError);
    expect(() => repo.delete()).toThrow(AuditEventImmutableError);
    // Row still present — immutability enforced.
    expect(repo.findById("evt-1")).toBeDefined();
    expect(repo.listByWorkspace("ws-1")).toHaveLength(1);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopLogger } from "@vision-control/logger";
import {
  ChangesetRepository,
  runMigrations,
  SessionRepository,
  WorkspaceRepository,
} from "@vision-control/storage";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { WorkspaceNotBoundError } from "./errors.js";
import { ChangesetService } from "./services/changeset-service.js";
import { SessionService } from "./services/session-service.js";
import { SourceRegistryService } from "./services/source-registry-service.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { createTestDb, deterministicUuid, makeRepos, NOW, WORKSPACE_ID } from "./test-helpers.js";

describe("SessionService", () => {
  it("issues a pairing token and validates it by hash", async () => {
    const db = createTestDb();
    const repos = makeRepos(db);
    const svc = new SessionService({
      ...repos,
      now: () => NOW,
      uuid: deterministicUuid,
    });

    const issued = await svc.issuePairingToken(WORKSPACE_ID, "http://localhost:5173");
    expect(issued.token.token.length).toBeGreaterThan(0);
    expect(issued.workspaceId).toBe(WORKSPACE_ID);

    const valid = await svc.validatePairingToken(issued.token.token);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.session.workspace_id).toBe(WORKSPACE_ID);
    }

    // raw token is never stored; only the hash
    const stored = repos.sessionRepo.findById(issued.sessionId);
    expect(stored?.token_hash).not.toBe(issued.token.token);
    expect(stored?.token_hash).toHaveLength(64); // sha-256 hex
  });

  it("rejects an unknown token as UNAUTHORIZED", async () => {
    const db = createTestDb();
    const svc = new SessionService({ ...makeRepos(db), now: () => NOW, uuid: deterministicUuid });
    const result = await svc.validatePairingToken("totally-wrong-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHORIZED");
    }
  });

  it("rejects an expired token as UNAUTHORIZED", async () => {
    const db = createTestDb();
    let clock = NOW;
    const svc = new SessionService({
      ...makeRepos(db),
      now: () => clock,
      uuid: deterministicUuid,
      ttlMs: 1000,
    });
    const issued = await svc.issuePairingToken(WORKSPACE_ID);
    clock += 2000; // expire
    const result = await svc.validatePairingToken(issued.token.token);
    expect(result.ok).toBe(false);
  });
});

describe("WorkspaceService + SourceRegistryService", () => {
  it("blocks source reads until a session binds a workspace (WORKSPACE_NOT_BOUND)", () => {
    const db = createTestDb();
    const repos = makeRepos(db);
    const workspaceService = new WorkspaceService();
    const sourceService = new SourceRegistryService({
      sourceRepo: repos.sourceRepo,
      workspaceService,
      logger: repos.logger,
      now: () => NOW,
      uuid: deterministicUuid,
    });
    const sessionId = "session-unbound";

    // Given: session is not bound
    // When: attempting a source read
    // Then: WORKSPACE_NOT_BOUND
    expect(() => sourceService.getBySourceId("src-1", sessionId)).toThrow(WorkspaceNotBoundError);
    try {
      sourceService.getBySourceId("src-1", sessionId);
    } catch (error) {
      expect((error as WorkspaceNotBoundError).code).toBe("WORKSPACE_NOT_BOUND");
    }
  });

  it("allows source reads after binding", () => {
    const db = createTestDb();
    const repos = makeRepos(db);
    const workspaceService = new WorkspaceService();
    const sourceService = new SourceRegistryService({
      sourceRepo: repos.sourceRepo,
      workspaceService,
      logger: repos.logger,
      now: () => NOW,
      uuid: deterministicUuid,
    });
    const sessionId = "session-bound";
    workspaceService.bind(sessionId, WORKSPACE_ID);

    const row = sourceService.register({
      sessionId,
      sourceId: "src-1",
      filePath: "src/Button.tsx",
      range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 0 },
      fingerprint: "abc12345",
    });
    expect(row.source_id).toBe("src-1");

    const found = sourceService.getBySourceId("src-1", sessionId);
    expect(found?.file_path).toBe("src/Button.tsx");
  });
});

describe("ChangesetService persist + restore", () => {
  it("persists a changeset and restores it after a simulated restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-restart-"));
    const dbPath = join(dir, "daemon.db");

    // Run 1: start, persist a changeset
    let db = new Database(dbPath);
    runMigrations(db);
    new WorkspaceRepository(db).insert({
      id: WORKSPACE_ID,
      path: "/tmp/ws",
      name: "ws",
      created_at: NOW,
      updated_at: NOW,
    });
    new SessionRepository(db).insert({
      id: "sess-1",
      workspace_id: WORKSPACE_ID,
      token_hash: "0".repeat(64),
      origin: "loopback",
      created_at: NOW,
      expires_at: NOW + 60_000,
      last_active_at: NOW,
    });
    const persistService = new ChangesetService({
      changesetRepo: new ChangesetRepository(db),
      logger: new NoopLogger(),
      now: () => NOW,
      uuid: deterministicUuid,
    });
    const persisted = persistService.persist({
      sessionId: "sess-1",
      workspaceId: WORKSPACE_ID,
      operations: [{ kind: "style-edit", target: "#btn" }],
    });
    const persistedId = persisted.id;
    db.close();

    // Run 2: restart, reopen the same db file, restore
    db = new Database(dbPath);
    const restoreService = new ChangesetService({
      changesetRepo: new ChangesetRepository(db),
      logger: new NoopLogger(),
    });
    const restored = restoreService.restore(WORKSPACE_ID);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(persistedId);
    expect(JSON.parse(restored[0]?.operations_json ?? "[]")).toEqual([
      { kind: "style-edit", target: "#btn" },
    ]);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

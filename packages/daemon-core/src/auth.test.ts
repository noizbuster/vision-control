import type { IncomingMessage } from "node:http";
import { defaultAllowlistConfig } from "@vision-control/security";
import { describe, expect, it } from "vitest";
import { authenticateUpgrade, extractTokenFromUrl } from "./auth.js";
import { SessionService } from "./services/session-service.js";
import { createTestDb, deterministicUuid, makeRepos, NOW, WORKSPACE_ID } from "./test-helpers.js";

function makeReq(headers: Record<string, string>, url: string): IncomingMessage {
  return { headers, url } as unknown as IncomingMessage;
}

describe("authenticateUpgrade", () => {
  it("accepts a valid token from an allowed origin", async () => {
    const db = createTestDb();
    const svc = new SessionService({ ...makeRepos(db), now: () => NOW, uuid: deterministicUuid });
    const issued = await svc.issuePairingToken(WORKSPACE_ID, "http://127.0.0.1:5173");
    const req = makeReq({ origin: "http://127.0.0.1:5173" }, `/?token=${issued.token.token}`);
    const decision = await authenticateUpgrade(req, svc, defaultAllowlistConfig());
    expect(decision.ok).toBe(true);
  });

  it("rejects a disallowed origin with ORIGIN_NOT_ALLOWED", async () => {
    const db = createTestDb();
    const svc = new SessionService({ ...makeRepos(db), now: () => NOW, uuid: deterministicUuid });
    const issued = await svc.issuePairingToken(WORKSPACE_ID);
    const req = makeReq({ origin: "https://evil.example.com" }, `/?token=${issued.token.token}`);
    const decision = await authenticateUpgrade(req, svc, defaultAllowlistConfig());
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("ORIGIN_NOT_ALLOWED");
      expect(decision.status).toBe(403);
    }
  });

  it("rejects a missing token with UNAUTHORIZED", async () => {
    const db = createTestDb();
    const svc = new SessionService({ ...makeRepos(db), now: () => NOW, uuid: deterministicUuid });
    const req = makeReq({ origin: "http://127.0.0.1:5173" }, "/");
    const decision = await authenticateUpgrade(req, svc, defaultAllowlistConfig());
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("UNAUTHORIZED");
      expect(decision.status).toBe(401);
    }
  });

  it("rejects a wrong token with UNAUTHORIZED", async () => {
    const db = createTestDb();
    const svc = new SessionService({ ...makeRepos(db), now: () => NOW, uuid: deterministicUuid });
    const req = makeReq({ origin: "http://127.0.0.1:5173" }, "/?token=wrong");
    const decision = await authenticateUpgrade(req, svc, defaultAllowlistConfig());
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("extractTokenFromUrl", () => {
  it("extracts the token query parameter", () => {
    expect(extractTokenFromUrl("/?token=abc123")).toBe("abc123");
    expect(extractTokenFromUrl("/?foo=1&token=xyz")).toBe("xyz");
    expect(extractTokenFromUrl("/?token=")).toBeUndefined();
    expect(extractTokenFromUrl("/no-query")).toBeUndefined();
    expect(extractTokenFromUrl("/?other=1")).toBeUndefined();
  });
});

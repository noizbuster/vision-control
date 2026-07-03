import { expect, test } from "@playwright/test";

import { checkSendPermission } from "../../src/messaging/context-permissions.ts";
import { classifyFrames } from "../../src/messaging/frame-discovery.ts";

/**
 * Risk gate R4: tab/frame isolation.
 *
 * Exercises the real permission layer and frame classifier from the extension's
 * messaging module. Each test verifies the actual enforcement logic that the
 * MessageRouter relies on.
 */

type BusRoute = "content" | "panel" | "background" | "daemon";

const ctx = (route: BusRoute, tabId?: number, frameId?: number) => ({ route, tabId, frameId });
const msg = (messageType: string, targetRoute: BusRoute, tabId?: number, frameId?: number) => ({
  messageType,
  targetRoute,
  tabId,
  frameId,
});

test.describe("risk: tab/frame isolation", () => {
  test("tab A content script cannot send messages to tab B", () => {
    const sender = ctx("content", 10, 0);
    const message = msg("style-edit", "content", 20, 0);
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("20");
      expect(result.reason).toContain("10");
    }
  });

  test("cross-origin iframe is classified as not routeable", () => {
    const frames = [
      { frameId: 0, url: "http://127.0.0.1:3000/page", parentFrameId: -1 },
      { frameId: 5, url: "https://external.example.com/widget", parentFrameId: 0 },
    ];
    const classified = classifyFrames(frames as never[], "http://127.0.0.1:3000");
    expect(classified[1]?.routeable).toBe(false);
  });

  test("content script cannot send daemon:* messages (permission drop)", () => {
    const sender = ctx("content", 1, 0);
    const message = msg("daemon:source.request", "daemon", 1);
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("daemon");
    }
  });

  test("panel without tabId is rejected", () => {
    const sender = ctx("panel");
    const message = msg("select-element", "content");
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("tabId");
    }
  });

  test("unknown frameId is classified (not in the discovered tree is not routeable for cross-origin)", () => {
    const frames = [
      { frameId: 0, url: "http://localhost:5173/", parentFrameId: -1 },
      { frameId: 1, url: "http://localhost:5173/known", parentFrameId: 0 },
    ];
    const classified = classifyFrames(frames as never[], "http://localhost:5173");
    const knownFrame = classified.find((f) => f.frameId === 1);
    const unknownFrame = classified.find((f) => f.frameId === 999);
    expect(knownFrame).toBeDefined();
    expect(knownFrame?.routeable).toBe(true);
    expect(unknownFrame).toBeUndefined();
  });
});

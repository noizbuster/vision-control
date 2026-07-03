import { expect, test } from "@playwright/test";

import { checkSendPermission } from "../src/messaging/context-permissions.ts";
import { classifyFrames } from "../src/messaging/frame-discovery.ts";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @routing-isolation — tab/frame/session isolation.
 *
 * Exercises the real permission layer (checkSendPermission) and frame
 * classifier (classifyFrames) from the extension's messaging module, plus
 * browser-driven verification that the content script re-injects after reload.
 */

type BusRoute = "content" | "panel" | "background" | "daemon";

const ctx = (route: BusRoute, tabId?: number, frameId?: number) => ({ route, tabId, frameId });
const msg = (messageType: string, targetRoute: BusRoute, tabId?: number, frameId?: number) => ({
  messageType,
  targetRoute,
  tabId,
  frameId,
});

test.describe("@routing-isolation permission", () => {
  test("two tabs are isolated: content script cannot target a different tab", () => {
    const sender = ctx("content", 1, 0);
    const message = msg("select-element", "content", 2, 0);
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
  });

  test("same-origin iframe frame is classified as routeable", () => {
    const frames = [
      { frameId: 0, url: "http://localhost:5173/", parentFrameId: -1 },
      { frameId: 1, url: "http://localhost:5173/nested", parentFrameId: 0 },
    ];
    const classified = classifyFrames(frames as never[], "http://localhost:5173");
    expect(classified[0]?.routeable).toBe(true);
    expect(classified[1]?.routeable).toBe(true);
  });

  test("cross-origin iframe is classified as not routeable (opaque)", () => {
    const frames = [
      { frameId: 0, url: "http://localhost:5173/", parentFrameId: -1 },
      { frameId: 1, url: "https://evil.com/embed", parentFrameId: 0 },
    ];
    const classified = classifyFrames(frames as never[], "http://localhost:5173");
    expect(classified[0]?.routeable).toBe(true);
    expect(classified[1]?.routeable).toBe(false);
  });

  test("panel message without tabId is rejected", () => {
    const sender = ctx("panel");
    const message = msg("select-element", "content");
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
  });

  test("content script cannot send daemon-bound messages", () => {
    const sender = ctx("content", 1, 0);
    const message = msg("daemon:source.request", "daemon", 1);
    const result = checkSendPermission(sender, message);
    expect(result.allowed).toBe(false);
  });
});

extTest.describe("@routing-isolation browser", () => {
  extTest(
    "page reload preserves overlay injection (content script re-attaches)",
    async ({ page }) => {
      await serveFixture(page, fixtureHtml('<div id="target">Content</div>'));
      const before = await page.locator("[data-vc-overlay-host]").count();
      extExpect(before).toBe(1);

      await page.reload();
      await page.waitForSelector("[data-vc-overlay-host]", { timeout: 10_000 });
      const after = await page.locator("[data-vc-overlay-host]").count();
      extExpect(after).toBe(1);
    },
  );
});

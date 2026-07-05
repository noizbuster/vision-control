import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, chromium, expect, type Page, type Worker } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(HERE, "..", "..", ".output", "chrome-mv3");
const FIXTURE_ORIGIN = "http://localhost:9973";
const EXTENSION_URL_PREFIX = "chrome-extension://";

type E2eInteractionMode = "Inspect" | "Move" | "Resize" | "Text" | "Layout";

interface ServeFixtureOptions {
  readonly path?: string;
  readonly interactionMode?: E2eInteractionMode | null;
}

interface E2eChromeApi {
  readonly runtime: {
    readonly sendMessage: (message: unknown) => Promise<unknown>;
  };
  readonly tabs: {
    readonly query: (queryInfo: Record<string, unknown>) => Promise<
      readonly {
        readonly id?: number;
        readonly url?: string;
      }[]
    >;
  };
}

export function fixtureHtml(bodyHtml: string, headHtml = ""): string {
  return `<!DOCTYPE html><html><head>${headHtml}<style>body{margin:0;padding:40px;font-family:sans-serif}</style></head><body>${bodyHtml}</body></html>`;
}

export function fixtureUrl(path = "board"): string {
  return `${FIXTURE_ORIGIN}/${path}`;
}

export const test = base.extend({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture with no deps
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(resolve(tmpdir(), "vc-e2e-"));
    const args = [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
    ];
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args,
      viewport: { width: 1280, height: 720 },
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },
});

export { expect };

export async function serveFixture(
  page: Page,
  html: string,
  pathOrOptions: string | ServeFixtureOptions = "board",
): Promise<void> {
  const options =
    typeof pathOrOptions === "string" ? { path: pathOrOptions } : { ...pathOrOptions };
  const path = options.path ?? "board";
  const interactionMode =
    options.interactionMode === undefined ? "Inspect" : options.interactionMode;
  await page.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(`${FIXTURE_ORIGIN}/${path}`);
  await page.waitForSelector("[data-vc-overlay-host]", { timeout: 10_000 });
  await page.waitForTimeout(500);
  await setInteractionMode(page, interactionMode);
}

interface OverlayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function overlayElementInfo(
  page: Page,
  selector: string,
): Promise<OverlayRect | null> {
  return page.evaluate((sel) => {
    const host = document.querySelector("[data-vc-overlay-host]");
    const el = host?.shadowRoot?.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

export async function overlayElementCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const host = document.querySelector("[data-vc-overlay-host]");
    return host?.shadowRoot?.querySelectorAll(sel).length ?? 0;
  }, selector);
}

export async function pageElementRect(page: Page, selector: string): Promise<OverlayRect> {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

export async function setInteractionMode(
  page: Page,
  mode: E2eInteractionMode | null,
): Promise<void> {
  const extensionId = await getExtensionId(page);
  const pageUrl = page.url();
  const extensionPage = await page.context().newPage();
  try {
    await extensionPage.goto(`${EXTENSION_URL_PREFIX}${extensionId}/panel.html`);
    await extensionPage.evaluate(
      async ({ mode: nextMode, pageUrl: targetUrl }) => {
        const chromeApi = (globalThis as { readonly chrome?: E2eChromeApi }).chrome;
        if (chromeApi === undefined) {
          throw new Error("Chrome extension APIs are unavailable in the extension page");
        }
        const tabs = await chromeApi.tabs.query({});
        const targetOrigin = new URL(targetUrl).origin;
        const tab =
          tabs.find((candidate) => candidate.url === targetUrl) ??
          tabs.find((candidate) => candidate.url?.startsWith(`${targetOrigin}/`));
        if (tab?.id === undefined) {
          throw new Error(`Could not find fixture tab for ${targetUrl}`);
        }
        await chromeApi.runtime.sendMessage({
          protocolVersion: "1.0.0",
          messageId: `e2e-interaction-mode-${Date.now()}`,
          messageType: "interaction-mode",
          sourceRoute: "panel",
          targetRoute: "content",
          tabId: tab.id,
          frameId: 0,
          payload: { mode: nextMode },
          timestamp: Date.now(),
        });
      },
      { mode, pageUrl },
    );
    await page.waitForTimeout(100);
  } finally {
    await extensionPage.close();
  }
}

async function getExtensionId(page: Page): Promise<string> {
  const worker = await getExtensionServiceWorker(page);
  return new URL(worker.url()).host;
}

async function getExtensionServiceWorker(page: Page): Promise<Worker> {
  const existing = page
    .context()
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(EXTENSION_URL_PREFIX));
  if (existing !== undefined) return existing;
  return page.context().waitForEvent("serviceworker", {
    predicate: (worker) => worker.url().startsWith(EXTENSION_URL_PREFIX),
    timeout: 10_000,
  });
}

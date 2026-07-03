import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, chromium, expect, type Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(HERE, "..", "..", ".output", "chrome-mv3");
const FIXTURE_ORIGIN = "http://localhost:9973";

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

export async function serveFixture(page: Page, html: string, path = "board"): Promise<void> {
  await page.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(`${FIXTURE_ORIGIN}/${path}`);
  await page.waitForSelector("[data-vc-overlay-host]", { timeout: 10_000 });
  await page.waitForTimeout(500);
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

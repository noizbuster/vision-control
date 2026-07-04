import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * @next-source-markers-turbopack — dev-only source markers via the Turbopack
 * loader (task 13 / VC-V1V2-13 / ADR-008).
 *
 * Task 13 registered `injectNextMarkers` as a Turbopack loader rule
 * (`turbopack.rules` for `*.tsx`/`*.jsx`, dev-only via `isNextProduction()`).
 * This spec drives `next dev --turbo` and asserts the opaque `data-vc-source`
 * markers appear in the served dev HTML — the Turbopack counterpart of the
 * webpack-path spec (`next-source-markers.spec.ts`). Production markers stay
 * zero (covered by `src/production-no-markers.turbopack.test.ts`).
 *
 * The Turbopack dev server runs on a separate port (3199) from the webpack
 * webServer (3100) declared in `playwright.config.ts`, so both specs can coexist
 * in one `playwright test` run. The lifecycle is managed in `beforeAll`/`afterAll`
 * with SIGTERM → SIGKILL escalation so no dev server survives the run.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CWD = resolve(HERE, "..");
const NEXT_BIN = join(CWD, "node_modules", ".bin", "next");
const TURBOPACK_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TURBOPACK_PORT}`;

interface DevServer {
  readonly child: ChildProcess;
  readonly stop: () => Promise<void>;
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Turbopack dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function startTurbopackDev(): Promise<DevServer> {
  const child = spawn(NEXT_BIN, ["dev", "--turbo", "-p", String(TURBOPACK_PORT)], {
    cwd: CWD,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development" },
  });
  child.stdout?.on("data", () => {
    // drain — compile logs are noisy; readiness is detected by polling.
  });
  child.stderr?.on("data", () => {
    // drain
  });
  await waitForServer(BASE_URL);
  return {
    child,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((done) => {
        const force = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 5000);
        child.once("exit", () => {
          clearTimeout(force);
          done();
        });
        child.kill("SIGTERM");
      });
    },
  };
}

let server: DevServer | undefined;

test.beforeAll(async () => {
  server = await startTurbopackDev();
}, 90_000);

test.afterAll(async () => {
  await server?.stop();
});

test.describe("@next-source-markers-turbopack — dev-only markers via Turbopack", () => {
  test("next dev --turbo injects data-vc-source markers into the app-router page", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await expect(page.locator("main")).toBeVisible();

    const html = await page.content();
    const markerCount = (html.match(/data-vc-source="/g) ?? []).length;
    // At least one JSX element carries an opaque dev-only source marker — the
    // Turbopack loader ran `injectNextMarkers` (task 13). The marker is a
    // truncated hash; it carries no file path (ADR-008).
    expect(markerCount, "Turbopack dev HTML must contain data-vc-source markers").toBeGreaterThan(
      0,
    );
  });

  test("markers do NOT leak the workspace path (opaque token only, ADR-008)", async ({ page }) => {
    await page.goto(BASE_URL);
    const html = await page.content();
    // The marker value is a content hash, never a path. Assert no marker value
    // contains a path-like segment (slash, drive letter, extension).
    const markers = html.match(/data-vc-source="[^"]*"/g) ?? [];
    expect(markers.length, "at least one marker must be present").toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker, "marker must not leak a file path").not.toMatch(/\/|\.(tsx|jsx|ts|js)/i);
    }
  });

  test("client component still hydrates and increments under Turbopack", async ({ page }) => {
    await page.goto(BASE_URL);
    const button = page.locator("button", { hasText: "Count" });
    await expect(button).toBeVisible();
    await expect(button).toHaveText(/Count: 0/);
    await button.click();
    await expect(button).toHaveText(/Count: 1/);
  });
});

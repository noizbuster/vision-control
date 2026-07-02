import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Browser, BrowserContext, Page } from "playwright";

/**
 * Thrown when the unpacked extension directory passed to
 * {@link loadExtension} does not exist.
 */
export class ExtensionNotFoundError extends Error {
  readonly extensionPath: string;
  constructor(extensionPath: string) {
    super(
      `Extension directory not found at ${extensionPath}. Build apps/extension before running e2e.`,
    );
    this.name = "ExtensionNotFoundError";
    this.extensionPath = extensionPath;
  }
}

export interface ExtensionLoadOptions {
  /** Path to the unpacked extension directory (must exist at load time). */
  readonly extensionPath: string;
  /** Extra Chromium args appended to the canonical set. */
  readonly extraArgs?: readonly string[];
  /** Remote debugging port (`0` = random). Default `0`. */
  readonly remoteDebuggingPort?: number;
  /**
   * Headed vs headless. Chrome extensions CANNOT run in the legacy headless
   * shell; the new headless mode supports them. Default `false` (headed) for
   * maximum compatibility. Set `true` only with a Playwright new enough to
   * default to new headless.
   */
  readonly headless?: boolean;
}

/**
 * Build the canonical Chromium launch args for loading an unpacked extension.
 * Pure function; does not touch Playwright or the filesystem (beyond resolving
 * the path), so it is safe to unit-test without a browser.
 */
export function buildExtensionLaunchArgs(options: ExtensionLoadOptions): string[] {
  const abs = resolve(options.extensionPath);
  const port = options.remoteDebuggingPort ?? 0;
  const extra = options.extraArgs ?? [];
  return [
    `--disable-extensions-except=${abs}`,
    `--load-extension=${abs}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    ...extra,
  ];
}

export interface ExtensionContext {
  readonly extensionPath: string;
  readonly browser: Browser;
  readonly context: BrowserContext;
  /**
   * The extension's background page, or `null` until one registers. Real
   * background-page / service-worker discovery is wired in task 10+ once a
   * manifest + service worker exist; stubbed to `null` for now.
   */
  readonly backgroundPage: Page | null;
}

/**
 * Launch Chromium with the unpacked extension at `options.extensionPath`
 * loaded. Requires Playwright's Chromium browser binary
 * (`pnpm playwright install chromium`) — e.g. provided by CI.
 */
export async function loadExtension(options: ExtensionLoadOptions): Promise<ExtensionContext> {
  const abs = resolve(options.extensionPath);
  if (!existsSync(abs)) {
    throw new ExtensionNotFoundError(abs);
  }
  const { chromium } = await import("playwright");
  const args = buildExtensionLaunchArgs({ ...options, extensionPath: abs });
  const headless = options.headless ?? false;
  const browser = await chromium.launch({ headless, args });
  const context = await browser.newContext();
  // Stub: real background-page / service-worker retrieval lands in task 10+.
  const backgroundPage: Page | null = null;
  return { extensionPath: abs, browser, context, backgroundPage };
}

/**
 * Load an extension, run `testFn` with the context, and always close the
 * browser afterwards (even on failure).
 */
export async function withExtensionContext<T>(
  options: ExtensionLoadOptions,
  testFn: (ctx: ExtensionContext) => Promise<T>,
): Promise<T> {
  const ctx = await loadExtension(options);
  try {
    return await testFn(ctx);
  } finally {
    await ctx.browser.close();
  }
}

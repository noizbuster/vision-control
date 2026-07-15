#!/usr/bin/env node
/**
 * extension:dev-pair — start the daemon with --no-open, then launch WXT so the
 * pairing page opens inside the Chromium instance that has the extension loaded.
 *
 * Usage (from apps/extension or via nx):
 *   node scripts/dev-with-pair.mjs
 *
 * Env:
 *   VC_DAEMON_PORT   daemon bind port (default 4321)
 *   VC_DAEMON_BIN    path to daemon entry (default <repo>/apps/daemon/dist/index.js)
 *   VC_DEV_START_URLS optional comma-separated extra start URLs (overrides pair URL alone)
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { consumeStdoutForReady } from "./dev-pair-helpers.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(EXTENSION_ROOT, "../..");

const DEFAULT_PORT = "4321";
const READY_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 2_000;

function log(message) {
  process.stderr.write(`[dev-pair] ${message}\n`);
}

function printHelp() {
  process.stdout.write(`extension:dev-pair — daemon + WXT with pairing page in the extension browser.

Usage:
  node scripts/dev-with-pair.mjs
  pnpm nx run extension:dev-pair

Starts the Vision Control daemon with --no-open (so the OS default browser is
not used), waits for the ready JSON line, then launches WXT with
VC_PAIRING_HTTP_URL set so webExt.startUrls opens the pair page inside the
WXT-launched Chromium (extension loaded).

Environment:
  VC_DAEMON_PORT     Bind port for the daemon (default: ${DEFAULT_PORT})
  VC_DAEMON_BIN      Path to apps/daemon/dist/index.js
  VC_DEV_START_URLS  Optional comma-separated start URLs (wins over pair URL)

Signals:
  SIGINT / SIGTERM stop WXT and the daemon.
`);
}

function resolveDaemonBinary() {
  const fromEnv = process.env.VC_DAEMON_BIN;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return resolve(fromEnv);
  }
  return resolve(REPO_ROOT, "apps/daemon/dist/index.js");
}

function killTree(child, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill(signal);
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function stopChild(child, signal = "SIGTERM") {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      done();
      return;
    }
    const force = setTimeout(() => {
      killTree(child, "SIGKILL");
    }, STOP_GRACE_MS);
    child.once("exit", () => {
      clearTimeout(force);
      done();
    });
    killTree(child, signal);
  });
}

/**
 * @param {string} binaryPath
 * @param {string} port
 * @param {string} dbPath
 */
function startDaemon(binaryPath, port, dbPath) {
  const args = [
    binaryPath,
    "--no-open",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--workspace",
    REPO_ROOT,
    "--db",
    dbPath,
  ];
  log(`starting daemon: node ${args.join(" ")}`);
  return spawn("node", args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

/**
 * @param {import("node:child_process").ChildProcess} child
 */
function waitForReady(child) {
  return new Promise((resolveReady, reject) => {
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`timed out after ${READY_TIMEOUT_MS}ms waiting for daemon ready line`));
    }, READY_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.off("error", onError);
      child.off("exit", onExit);
    };

    const onStdout = (chunk) => {
      const text = chunk.toString("utf8");
      // Forward daemon stdout (includes the ready JSON with token once).
      process.stdout.write(text);
      const { ready, rest } = consumeStdoutForReady(buffer, text);
      buffer = rest;
      if (ready !== null && !settled) {
        settled = true;
        cleanup();
        resolveReady(ready);
      }
    };

    const onStderr = (chunk) => {
      process.stderr.write(chunk);
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `daemon exited before ready (code=${code ?? "null"} signal=${signal ?? "null"}). ` +
            `If port ${process.env.VC_DAEMON_PORT ?? DEFAULT_PORT} is already in use, free it or set VC_DAEMON_PORT.`,
        ),
      );
    };

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.on("error", onError);
    child.on("exit", onExit);
  });
}

/**
 * @param {string} pairingHttpUrl
 */
function startWxt(pairingHttpUrl) {
  const env = {
    ...process.env,
    VC_PAIRING_HTTP_URL: pairingHttpUrl,
  };
  // Prefer local package binary; fall back to pnpm exec from extension root.
  const wxtBin = resolve(EXTENSION_ROOT, "node_modules/.bin/wxt");
  const useLocal = existsSync(wxtBin);
  const command = useLocal ? wxtBin : "pnpm";
  const args = useLocal ? [] : ["exec", "wxt"];
  log(`starting wxt with VC_PAIRING_HTTP_URL set (extension browser will open pair page)`);
  return spawn(command, args, {
    cwd: EXTENSION_ROOT,
    stdio: "inherit",
    env,
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return 0;
  }

  const binaryPath = resolveDaemonBinary();
  if (!existsSync(binaryPath)) {
    log(
      `daemon binary not found at ${binaryPath}.\n` +
        `  Build it first: pnpm nx run daemon:build\n` +
        `  Or set VC_DAEMON_BIN to a built entry path.`,
    );
    return 1;
  }

  const port = process.env.VC_DAEMON_PORT?.trim() || DEFAULT_PORT;
  const dbPath = resolve(REPO_ROOT, ".vision-control", "dev-pair-daemon.db");

  const daemon = startDaemon(binaryPath, port, dbPath);

  /** @type {import("node:child_process").ChildProcess | null} */
  let wxt = null;
  let shuttingDown = false;

  const shutdown = async (signal = "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutting down (${signal})…`);
    if (wxt !== null) {
      await stopChild(wxt, signal);
    }
    await stopChild(daemon, signal);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT").then(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").then(() => process.exit(143));
  });

  let ready;
  try {
    ready = await waitForReady(daemon);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`daemon failed: ${message}`);
    await stopChild(daemon, "SIGTERM");
    return 1;
  }

  log(`daemon ready on ${ready.host}:${ready.port}`);
  log(`pairing page will open in WXT browser: ${ready.pairingHttpUrl}`);

  wxt = startWxt(ready.pairingHttpUrl);

  const wxtExitCode = await new Promise((resolveExit) => {
    wxt.once("exit", (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0));
    });
    wxt.once("error", (err) => {
      log(`wxt failed to start: ${err.message}`);
      resolveExit(1);
    });
  });

  await stopChild(daemon, "SIGTERM");
  return wxtExitCode;
}

const code = await main();
process.exit(code);

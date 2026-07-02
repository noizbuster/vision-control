import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Thrown by {@link startDaemon} when the resolved daemon binary does not exist.
 * The daemon ships in task 12; until then tests that need a real daemon should
 * fail loud (via this error) rather than pass vacuously. Use
 * {@link tryStartDaemon} for an opt-in null-on-missing variant.
 */
export class DaemonBinaryMissingError extends Error {
  readonly binaryPath: string;
  constructor(binaryPath: string) {
    super(
      `Daemon binary not found at ${binaryPath}. Build apps/daemon (task 12) or set VC_DAEMON_BIN to a valid path.`,
    );
    this.name = "DaemonBinaryMissingError";
    this.binaryPath = binaryPath;
  }
}

export interface StartDaemonOptions {
  /** Path to the daemon entry. Default: `VC_DAEMON_BIN` env or `apps/daemon/dist/index.js`. */
  readonly binaryPath?: string;
  /** Args forwarded to the daemon after the entry path. */
  readonly args?: readonly string[];
  /** Extra env merged over `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Working directory for the spawned process. */
  readonly cwd?: string;
  /** Base URL the daemon will listen on (placeholder until task 12 defines the protocol). */
  readonly url?: string;
  /** Auth token the daemon expects (placeholder until task 12). */
  readonly token?: string;
}

export interface DaemonHandle {
  readonly url: string;
  readonly token: string;
  readonly child: ChildProcess;
  /** Stop the daemon (SIGTERM, escalate to SIGKILL after 2s). */
  readonly stop: () => Promise<void>;
}

const DEFAULT_BINARY = "apps/daemon/dist/index.js";
const STOP_GRACE_MS = 2000;

/** Resolve the daemon binary path from options, env, or the default. */
export function resolveDaemonBinaryPath(options?: StartDaemonOptions): string {
  const path = options?.binaryPath ?? process.env.VC_DAEMON_BIN ?? DEFAULT_BINARY;
  return resolve(path);
}

function spawnDaemon(options: StartDaemonOptions, binaryPath: string): ChildProcess {
  const env = { ...process.env, ...(options.env ?? {}) };
  const spawnOptions: {
    stdio: "pipe";
    env: NodeJS.ProcessEnv;
    detached: boolean;
    cwd?: string;
  } = {
    stdio: "pipe",
    env,
    detached: false,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  };
  return spawn("node", [binaryPath, ...(options.args ?? [])], spawnOptions);
}

function generateToken(): string {
  return `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Spawn the daemon. Throws {@link DaemonBinaryMissingError} if the binary is
 * absent. The returned handle's `url`/`token` are placeholders until task 12
 * defines the daemon protocol (the helper is written against this interface so
 * later wiring is mechanical).
 */
export async function startDaemon(options?: StartDaemonOptions): Promise<DaemonHandle> {
  const resolvedOptions = options ?? {};
  const binaryPath = resolveDaemonBinaryPath(resolvedOptions);
  if (!existsSync(binaryPath)) {
    throw new DaemonBinaryMissingError(binaryPath);
  }
  const child = spawnDaemon(resolvedOptions, binaryPath);
  const url = resolvedOptions.url ?? process.env.VC_DAEMON_URL ?? "http://127.0.0.1:0";
  const token = resolvedOptions.token ?? process.env.VC_DAEMON_TOKEN ?? generateToken();
  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await new Promise<void>((done) => {
      const force = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, STOP_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(force);
        done();
      });
      child.kill("SIGTERM");
    });
  };
  return { url, token, child, stop };
}

/**
 * Like {@link startDaemon} but returns `null` instead of throwing when the
 * binary is missing. For opt-in tests that skip when no daemon is available.
 */
export async function tryStartDaemon(options?: StartDaemonOptions): Promise<DaemonHandle | null> {
  const binaryPath = resolveDaemonBinaryPath(options);
  if (!existsSync(binaryPath)) {
    return null;
  }
  return startDaemon(options);
}

/**
 * Start a daemon, run `testFn`, and always stop it afterwards. Rethrows the
 * test error after cleanup.
 */
export async function withDaemon<T>(
  testFn: (handle: DaemonHandle) => Promise<T>,
  options?: StartDaemonOptions,
): Promise<T> {
  const handle = await startDaemon(options);
  try {
    return await testFn(handle);
  } finally {
    await handle.stop();
  }
}

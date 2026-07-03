/**
 * `vision-control daemon` — start the Vision Control daemon.
 *
 * Spawns the daemon binary (from `apps/daemon`) as a child process with
 * inherited stdio so the user sees the daemon's pairing URL and logs.
 * The process runs until interrupted (Ctrl-C).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve the daemon binary path: VC_DAEMON_BIN env > workspace apps/daemon. */
export function resolveDaemonBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.VC_DAEMON_BIN !== undefined && env.VC_DAEMON_BIN.length > 0) {
    return env.VC_DAEMON_BIN;
  }
  const candidates = [
    join(process.cwd(), "apps/daemon/dist/index.js"),
    join(dirname(fileURLToPath(import.meta.url)), "../../daemon/dist/index.js"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** Run the `daemon` command. Returns an exit code. */
export async function runDaemon(args: readonly string[]): Promise<number> {
  const binary = resolveDaemonBinary();
  if (binary === undefined) {
    process.stderr.write(
      "daemon binary not found. Build it first: pnpm nx run daemon:build\n" +
        "Or set VC_DAEMON_BIN to the daemon's dist/index.js path.\n",
    );
    return 1;
  }
  const child = spawn("node", [binary, ...args], {
    stdio: "inherit",
  });
  return new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (error) => {
      process.stderr.write(`failed to start daemon: ${error.message}\n`);
      resolve(1);
    });
  });
}

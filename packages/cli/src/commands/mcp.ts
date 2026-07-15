/**
 * `vision-control mcp` — launch the single-process MCP bridge binary (ADR-020 C2).
 *
 * Spawns `packages/mcp-server` dist/bin.js with inherited stdio so the agent
 * owns stdout JSON-RPC and the operator sees pair material on stderr.
 * Product CLI surface is this launcher only (plus help).
 */

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

/** Resolve the MCP binary path: VC_MCP_BIN env > workspace packages/mcp-server. */
export function resolveMcpBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.VC_MCP_BIN !== undefined && env.VC_MCP_BIN.length > 0) {
    return existsSync(env.VC_MCP_BIN) ? env.VC_MCP_BIN : undefined;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "packages/mcp-server/dist/bin.js"),
    // From packages/cli/src/commands or packages/cli/dist/commands
    join(here, "../../../mcp-server/dist/bin.js"),
    join(here, "../../mcp-server/dist/bin.js"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

export interface RunMcpOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly spawnImpl?: SpawnFn;
}

/** Run the `mcp` command. Returns an exit code. */
export async function runMcp(
  args: readonly string[],
  options: RunMcpOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const binary = resolveMcpBinary(env);
  if (binary === undefined) {
    process.stderr.write(
      "mcp binary not found. Build it first: pnpm nx run mcp-server:build\n" +
        "Or set VC_MCP_BIN to the mcp-server dist/bin.js path.\n",
    );
    return 1;
  }
  const spawnImpl = options.spawnImpl ?? spawn;
  const child = spawnImpl("node", [binary, ...args], {
    stdio: "inherit",
    env,
  });
  return new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (error) => {
      process.stderr.write(`failed to start mcp: ${error.message}\n`);
      resolve(1);
    });
  });
}

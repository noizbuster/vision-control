/**
 * `vision-control doctor` — run health checks across the whole workspace.
 *
 * Checks: (1) pnpm install, (2) package boundaries, (3) typecheck, (4) tests,
 * (5) build, (6) daemon binary starts, (7) daemon reachable, (8) MCP responds,
 * (9) playground reachable. Each prints a PASS/FAIL line with detail. Exits 0
 * only if every check passes.
 *
 * Workspace checks shell out to `pnpm`; runtime checks use HTTP/fetch. Slow
 * checks print a `running...` header so the user sees progress.
 */

import { type SpawnSyncOptions, spawnSync } from "node:child_process";

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";
import { resolveDaemonBinary } from "./daemon.js";
import { checkDaemon } from "./status.js";

export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** Per-command timeout cap (ms). Workspace build/test can take several minutes. */
const WORKSPACE_TIMEOUT_MS = 600_000;
const STARTUP_TIMEOUT_MS = 60_000;

interface CommandOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

/** Common spawn options: UTF-8 output, kill on timeout, shell only on Windows. */
const spawnOptions = (timeout: number): SpawnSyncOptions => ({
  encoding: "utf-8",
  timeout,
  shell: process.platform === "win32",
});

/** Run `pnpm <args>` in the current workspace and interpret the exit status. */
function runPnpm(args: readonly string[], timeout: number): CommandOutcome {
  const label = `pnpm ${args.join(" ")}`;
  const result = spawnSync("pnpm", [...args], spawnOptions(timeout));
  return interpretResult(result, label);
}

function interpretResult(result: ReturnType<typeof spawnSync>, label: string): CommandOutcome {
  if (result.error !== undefined) {
    return { ok: false, detail: `${label}: ${result.error.message}` };
  }
  if (result.status === null) {
    return {
      ok: false,
      detail: `${label}: timed out or killed (signal ${result.signal ?? "unknown"})`,
    };
  }
  if (result.status !== 0) {
    const tail = lastMeaningfulLine(`${result.stderr ?? ""}${result.stdout ?? ""}`);
    return {
      ok: false,
      detail: `${label}: exit ${result.status}${tail !== "" ? ` - ${tail}` : ""}`,
    };
  }
  return { ok: true, detail: `${label}: ok` };
}

/** Extract the last non-empty stderr/stdout line, truncated for a one-line report. */
function lastMeaningfulLine(output: string): string {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "";
  const last = lines[lines.length - 1] ?? "";
  return last.length > 120 ? `${last.slice(0, 117)}...` : last;
}

/** Run the `doctor` command. Returns an exit code (0 if all pass, 1 if any fail). */
export async function runDoctor(ctx: CliContext): Promise<number> {
  const checks: CheckResult[] = [];

  checks.push(await checkInstall(ctx));
  checks.push(checkBoundaries());
  checks.push(checkTypecheck());
  checks.push(checkTests());
  checks.push(checkBuild());
  checks.push(await checkDaemonBinary());
  checks.push(await checkDaemonReachable(ctx));
  checks.push(await checkMcp(ctx));
  checks.push(await checkPlayground());

  let allPassed = true;
  process.stdout.write("\nVision Control doctor\n======================\n\n");
  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    process.stdout.write(`[${status}] ${check.name}: ${check.detail}\n`);
    if (!check.passed) allPassed = false;
  }
  process.stdout.write(`\n${allPassed ? "All checks passed." : "One or more checks failed."}\n`);
  return allPassed ? 0 : 1;
}

async function checkInstall(_ctx: CliContext): Promise<CheckResult> {
  process.stdout.write("checking pnpm install...\n");
  const outcome = runPnpm(["install", "--frozen-lockfile"], WORKSPACE_TIMEOUT_MS);
  return { name: "install", passed: outcome.ok, detail: outcome.detail };
}

function checkBoundaries(): CheckResult {
  process.stdout.write("checking package boundaries...\n");
  const outcome = runPnpm(["run", "boundaries"], WORKSPACE_TIMEOUT_MS);
  return { name: "boundaries", passed: outcome.ok, detail: outcome.detail };
}

function checkTypecheck(): CheckResult {
  process.stdout.write("checking typecheck...\n");
  const outcome = runPnpm(["run", "typecheck"], WORKSPACE_TIMEOUT_MS);
  return { name: "typecheck", passed: outcome.ok, detail: outcome.detail };
}

function checkTests(): CheckResult {
  process.stdout.write("checking tests...\n");
  const outcome = runPnpm(["run", "test"], WORKSPACE_TIMEOUT_MS);
  return { name: "test", passed: outcome.ok, detail: outcome.detail };
}

function checkBuild(): CheckResult {
  process.stdout.write("checking build...\n");
  const outcome = runPnpm(["run", "build"], WORKSPACE_TIMEOUT_MS);
  return { name: "build", passed: outcome.ok, detail: outcome.detail };
}

/**
 * Verify the daemon binary is built and starts: spawn `node <bin> --help`,
 * which returns 0 without binding (the help path imports nothing heavy).
 */
async function checkDaemonBinary(): Promise<CheckResult> {
  process.stdout.write("checking daemon binary...\n");
  const binary = resolveDaemonBinary();
  if (binary === undefined) {
    return {
      name: "daemon-binary",
      passed: false,
      detail: "daemon binary not found - build it: pnpm nx run daemon:build",
    };
  }
  const result = spawnSync("node", [binary, "--help"], spawnOptions(STARTUP_TIMEOUT_MS));
  const outcome = interpretResult(result, `node ${binary} --help`);
  return { name: "daemon-binary", passed: outcome.ok, detail: outcome.detail };
}

async function checkDaemonReachable(ctx: CliContext): Promise<CheckResult> {
  process.stdout.write("checking daemon reachability...\n");
  const result = await checkDaemon(ctx.daemonUrl);
  return result.ok
    ? { name: "daemon", passed: true, detail: `reachable at ${ctx.daemonUrl}` }
    : {
        name: "daemon",
        passed: false,
        detail: `${result.reason} (start it: vision-control daemon)`,
      };
}

async function checkMcp(ctx: CliContext): Promise<CheckResult> {
  process.stdout.write("checking MCP server...\n");
  if (ctx.mcpEndpoint === undefined) {
    return { name: "mcp", passed: false, detail: "VC_MCP_URL not set" };
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_get_active_session");
  return result.ok
    ? { name: "mcp", passed: true, detail: `responding at ${ctx.mcpEndpoint.url}` }
    : { name: "mcp", passed: false, detail: result.error };
}

async function checkPlayground(): Promise<CheckResult> {
  process.stdout.write("checking playground...\n");
  const playgroundUrl = process.env.VC_PLAYGROUND_URL ?? "http://127.0.0.1:5173";
  try {
    const response = await fetch(playgroundUrl);
    return response.ok
      ? { name: "playground", passed: true, detail: `reachable at ${playgroundUrl}` }
      : { name: "playground", passed: false, detail: `HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: "playground", passed: false, detail: message };
  }
}

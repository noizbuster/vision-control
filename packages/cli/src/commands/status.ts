/**
 * `vision-control status` — show daemon connection status.
 */

import type { CliContext } from "../context.js";

/** Run the `status` command. Returns an exit code. */
export async function runStatus(ctx: CliContext): Promise<number> {
  const result = await checkDaemon(ctx.daemonUrl);
  if (result.ok) {
    process.stdout.write(`daemon: connected at ${ctx.daemonUrl}\n`);
    return 0;
  }
  process.stdout.write(`daemon: not reachable (${result.reason})\n`);
  process.stdout.write(`  url: ${ctx.daemonUrl}\n`);
  process.stdout.write("  start it with: vision-control daemon\n");
  return 1;
}

export async function checkDaemon(
  url: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  try {
    const response = await fetch(`${url}/health`);
    if (response.ok) return { ok: true };
    return { ok: false, reason: `HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }
}

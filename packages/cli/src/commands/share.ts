/**
 * `vision-control share export|import` — V2 local share bundles (ADR-015 / ADR-018).
 *
 * `share export [--include-screenshots] --out <path>` fetches the current
 * changeset and compiled context from the MCP server, builds a redacted, signed
 * bundle via `@vision-control/security`, and writes it to a LOCAL file. There is
 * no network relay: the file is the out-of-band sharing unit.
 *
 * `share import <path>` reads a local bundle file, verifies its hash/signature,
 * rejects tampered/token-bearing/screenshot-leaking bundles, and prints the
 * reconstructed redacted operations and source candidates. No MCP round-trip.
 */

import { readFile, writeFile } from "node:fs/promises";
import { exportBundle, importBundle, serializeAuditLog } from "@vision-control/security";

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";

export interface ShareExportArgs {
  readonly subcommand: "export";
  readonly out: string;
  readonly includeScreenshots: boolean;
}

export interface ShareImportArgs {
  readonly subcommand: "import";
  readonly path: string;
}

export type ParsedShareArgs =
  | ({ readonly ok: true } & ShareExportArgs)
  | ({ readonly ok: true } & ShareImportArgs)
  | { readonly ok: false; readonly message: string };

export const SHARE_USAGE =
  "usage: vision-control share export [--include-screenshots] --out <path>\n" +
  "       vision-control share import <path>";

/** Parse `share` subcommand args. Pure (no IO) so it is unit-testable. */
export function parseShareArgs(args: readonly string[]): ParsedShareArgs {
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === "export") {
    let out: string | undefined;
    let includeScreenshots = false;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      const next = rest[i + 1];
      if (arg === "--include-screenshots") {
        includeScreenshots = true;
      } else if (arg === "--out" && next !== undefined) {
        out = next;
        i += 1;
      } else if (arg?.startsWith("--out=")) {
        out = arg.slice("--out=".length);
      } else {
        return { ok: false, message: `unknown export option: ${arg}` };
      }
    }
    if (out === undefined) return { ok: false, message: "export requires --out <path>" };
    return { ok: true, subcommand: "export", out, includeScreenshots };
  }
  if (sub === "import") {
    const path = rest[0];
    if (path === undefined || path === "") {
      return { ok: false, message: "import requires <path>" };
    }
    return { ok: true, subcommand: "import", path };
  }
  return { ok: false, message: SHARE_USAGE };
}

const safeJson = (text: string, fallback: unknown): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const extractString = (value: unknown, key: string): string | undefined => {
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const field = record[key];
    if (typeof field === "string") return field;
  }
  return undefined;
};

/** Run `share export`. Fetches changeset + context from MCP, writes a local bundle. */
export async function runShareExport(parsed: ShareExportArgs, ctx: CliContext): Promise<number> {
  if (ctx.mcpEndpoint === undefined) {
    process.stderr.write("MCP endpoint not configured. Set VC_MCP_URL and VC_MCP_TOKEN.\n");
    return 1;
  }
  const changesetResult = await callMcpTool(ctx.mcpEndpoint, "vision_get_changeset");
  if (!changesetResult.ok) {
    process.stderr.write(`failed to fetch changeset: ${changesetResult.error}\n`);
    return 1;
  }
  const contextResult = await callMcpTool(ctx.mcpEndpoint, "vision_get_source_context");
  if (!contextResult.ok) {
    process.stderr.write(`failed to fetch context: ${contextResult.error}\n`);
    return 1;
  }
  const sessionResult = await callMcpTool(ctx.mcpEndpoint, "vision_get_active_session");
  const changeset = safeJson(changesetResult.text, {});
  const context = safeJson(contextResult.text, {});
  const session = sessionResult.ok ? safeJson(sessionResult.text, {}) : {};
  const sessionId =
    extractString(session, "sessionId") ??
    extractString(changeset, "sessionId") ??
    "unknown-session";
  const workspaceId =
    extractString(session, "workspaceId") ??
    extractString(changeset, "workspaceId") ??
    "unknown-workspace";

  const bundle = await exportBundle({
    workspaceId,
    sessionId,
    changeset,
    context,
    includeScreenshots: parsed.includeScreenshots,
    actor: "vision-control:share-export",
  });

  try {
    await writeFile(parsed.out, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  } catch (err) {
    process.stderr.write(
      `failed to write ${parsed.out}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `wrote share bundle to ${parsed.out}\n` +
      `  hash: ${bundle.hash.slice(0, 12)}…\n` +
      `  redactions: ${bundle.redactionReport.totalRedacted}\n` +
      `  screenshots: ${parsed.includeScreenshots ? "included (metadata only)" : "excluded"}\n`,
  );
  return 0;
}

/** Run `share import`. Reads a local bundle, verifies it, prints the reconstructed content. */
export async function runShareImport(parsed: ShareImportArgs): Promise<number> {
  let content: string;
  try {
    content = await readFile(parsed.path, "utf8");
  } catch (err) {
    process.stderr.write(
      `cannot read ${parsed.path}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  const result = await importBundle(content, { actor: "vision-control:share-import" });
  if (!result.ok) {
    process.stderr.write(`import rejected (${result.error.kind}): ${result.error.message}\n`);
    return 1;
  }
  const reconstructed = JSON.stringify(result.reconstructed, null, 2);
  process.stdout.write(
    `imported bundle ${result.bundle.hash.slice(0, 12)}…\n` +
      `reconstructed:\n${reconstructed}\n` +
      `audit:\n${serializeAuditLog(result.bundle.auditLog)}\n`,
  );
  return 0;
}

/** Dispatch `share` to export/import based on the parsed subcommand. */
export async function runShare(rest: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseShareArgs(rest);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n${SHARE_USAGE}\n`);
    return 1;
  }
  if (parsed.subcommand === "export") return runShareExport(parsed, ctx);
  return runShareImport(parsed);
}

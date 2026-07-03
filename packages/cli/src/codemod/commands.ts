import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { type SuggestedDiff, SuggestedDiffSchema } from "@vision-control/source-resolver";

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";
import { applySuggestion } from "./apply-suggestion.js";
import { renderDiffPreview } from "./diff-preview.js";

/**
 * Codemod CLI command handlers (VC-V1V2-23 / ADR-014).
 *
 * These commands live OUTSIDE MCP. They consume deterministic patch suggestions
 * (Task 14/21 generator output) as input. The `preview` subcommand shows the
 * diff + preconditions without writing. The `apply` subcommand requires an
 * explicit `--confirm` flag; without it the command refuses. With `--confirm`,
 * the command writes through the normal file-writing path and runs source-after-
 * HMR verification.
 *
 * The MCP tool list remains source-write-free. These commands never route
 * through an MCP tool.
 */

export type CodemodLoadResult =
  | { readonly kind: "ok"; readonly suggestion: SuggestedDiff }
  | { readonly kind: "error"; readonly reason: string };

/**
 * Load and validate a deterministic patch suggestion from a JSON file.
 *
 * The `suggestionId` argument is a file path pointing to a JSON document that
 * matches the {@link SuggestedDiffSchema} from `@vision-control/source-resolver`.
 * An agent saves the suggestion (from the MCP `vision_get_source_context`
 * response) to a file, then passes that path to the codemod.
 */
export const loadSuggestion = async (suggestionId: string): Promise<CodemodLoadResult> => {
  const filePath = resolve(suggestionId);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "error", reason: `cannot read suggestion file ${suggestionId}: ${message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "error", reason: `invalid JSON in ${suggestionId}: ${message}` };
  }

  const validated = SuggestedDiffSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      kind: "error",
      reason: `suggestion does not match SuggestedDiffSchema: ${validated.error.message}`,
    };
  }

  return { kind: "ok", suggestion: validated.data };
};

/**
 * `vision-control codemod preview <suggestion-id>` — show the diff +
 * preconditions WITHOUT writing.
 */
export const runCodemodPreview = async (suggestionId: string): Promise<number> => {
  const loaded = await loadSuggestion(suggestionId);
  if (loaded.kind === "error") {
    process.stderr.write(`error: ${loaded.reason}\n`);
    return 1;
  }

  process.stdout.write(`${renderDiffPreview(loaded.suggestion)}\n`);
  process.stdout.write("\n(preview only — no source was written)\n");
  return 0;
};

/**
 * `vision-control codemod apply <suggestion-id> [--confirm]` — write the
 * suggestion through the normal file-writing path and run source-after-HMR
 * verification. Without `--confirm` the command refuses.
 */
export const runCodemodApply = async (
  suggestionId: string,
  confirm: boolean,
  ctx: CliContext,
): Promise<number> => {
  const loaded = await loadSuggestion(suggestionId);
  if (loaded.kind === "error") {
    process.stderr.write(`error: ${loaded.reason}\n`);
    return 1;
  }

  const workspaceRoot = process.cwd();
  const result = await applySuggestion(loaded.suggestion, { confirm, workspaceRoot });

  switch (result.kind) {
    case "refused":
      process.stderr.write(`refused: ${result.reason}\n`);
      return 1;
    case "stale":
      process.stderr.write(`stale suggestion: ${result.reason}\n`);
      process.stderr.write(`detail: ${result.detail}\n`);
      return 1;
    case "error":
      process.stderr.write(`error: ${result.reason}\n`);
      return 1;
    case "applied":
      process.stdout.write(`applied: ${result.filePath}\n`);
      process.stdout.write(
        `verification: ${result.verification.sourceVerified ? "PASS" : "FAIL"} — ${result.verification.detail}\n`,
      );
      // Coordinate runtime HMR verification when MCP is available (coordination
      // signal, NOT a write tool — vision_request_verification is read-only).
      if (ctx.mcpEndpoint !== undefined) {
        const coordResult = await callMcpTool(ctx.mcpEndpoint, "vision_request_verification");
        if (coordResult.ok) {
          process.stdout.write(`runtime verification requested: ${coordResult.text}\n`);
        } else {
          process.stdout.write(`runtime verification request skipped: ${coordResult.error}\n`);
        }
      }
      return result.verification.sourceVerified ? 0 : 1;
  }
};

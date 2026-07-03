import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { SuggestedDiff } from "@vision-control/source-resolver";

/**
 * Codemod apply logic (VC-V1V2-23 / ADR-014).
 *
 * Consumes an inert {@link SuggestedDiff} payload (from Task 14/21's generator
 * output) and applies it through the **normal file-writing path** (`fs.writeFile`)
 * when the caller passes `confirm: true`. Without confirmation the apply is
 * REFUSED — there is no implicit or background apply.
 *
 * After writing, the codemod ALWAYS runs **source-after-HMR verification**: it
 * re-reads the file and asserts the applied lines are present at the expected
 * location. This proves the SOURCE changed (not just the preview). A dry-run
 * (preview) is never accepted as final evidence — the verification loop is
 * mandatory for an actual apply.
 *
 * The codemod lives OUTSIDE MCP. It never routes through an MCP tool. MCP stays
 * read-only (ADR-010 / ADR-014).
 */

export interface ApplyOptions {
  /** Must be `true` to actually write. Without it the apply is refused. */
  readonly confirm: boolean;
  /** Workspace root to resolve the suggestion's relative file path against. */
  readonly workspaceRoot: string;
}

export interface VerificationResult {
  /** True when the post-write source re-read confirms the applied lines. */
  readonly sourceVerified: boolean;
  readonly detail: string;
}

export type ApplyResult =
  | {
      readonly kind: "applied";
      readonly filePath: string;
      readonly verification: VerificationResult;
    }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "stale"; readonly reason: string; readonly detail: string }
  | { readonly kind: "error"; readonly reason: string };

interface ParsedDiffBody {
  readonly removals: readonly string[];
  readonly additions: readonly string[];
}

/**
 * Parse the unified-diff body into removal (old) and addition (new) lines.
 * File headers (`---`, `+++`) and hunk headers (`@@`) are skipped.
 */
const parseDiffBody = (diff: string): ParsedDiffBody => {
  const removals: string[] = [];
  const additions: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("@@")) continue;
    if (line.startsWith("-")) {
      removals.push(line.slice(1));
    } else if (line.startsWith("+")) {
      additions.push(line.slice(1));
    }
  }
  return { removals, additions };
};

/**
 * Apply a deterministic patch suggestion through the normal file-writing path.
 *
 * Steps (ADR-014):
 *   1. Require `confirm: true` (refuse without it).
 *   2. Read the current file content.
 *   3. Staleness check: the lines at the source range must match the diff's
 *      removal (old) lines. A mismatch means the file changed since the
 *      suggestion was generated — refuse to apply a stale patch.
 *   4. Replace the removal lines with the addition lines.
 *   5. Write through `fs.writeFile`.
 *   6. Source-after-HMR verification: re-read and assert the additions are
 *      present at the expected location.
 */
export const applySuggestion = async (
  suggestion: SuggestedDiff,
  options: ApplyOptions,
): Promise<ApplyResult> => {
  if (!options.confirm) {
    return {
      kind: "refused",
      reason:
        "apply requires --confirm; rerun with --confirm to write the suggestion through the normal file-writing path",
    };
  }

  const range = suggestion.sourceRanges[0];
  if (range === undefined) {
    return { kind: "error", reason: "suggestion has no source range" };
  }

  const filePath = resolve(options.workspaceRoot, suggestion.filePath);
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      reason: `cannot read ${suggestion.filePath}: ${message}`,
    };
  }

  const { removals, additions } = parseDiffBody(suggestion.diff);
  const lines = content.split("\n");
  const startIdx = range.startLine - 1;

  if (removals.length > 0) {
    const currentSlice = lines.slice(startIdx, startIdx + removals.length);
    const matchesExpected = removals.every(
      (expected, i) => currentSlice[i] !== undefined && currentSlice[i] === expected,
    );
    if (!matchesExpected) {
      return {
        kind: "stale",
        reason: `the source at ${suggestion.filePath}:${range.startLine} no longer matches the suggestion's "before" state`,
        detail: `expected: ${removals.join(" | ")}; found: ${currentSlice.join(" | ")}`,
      };
    }
  }

  const updatedLines = [
    ...lines.slice(0, startIdx),
    ...additions,
    ...lines.slice(startIdx + removals.length),
  ];
  const updatedContent = updatedLines.join("\n");

  await writeFile(filePath, updatedContent, "utf-8");

  const verification = await verifySourceApplied(filePath, range.startLine, additions);

  return {
    kind: "applied",
    filePath: suggestion.filePath,
    verification,
  };
};

/**
 * Source-after-HMR verification: re-read the file and assert the applied lines
 * are present at the expected start line. This proves the SOURCE changed (not
 * just the preview). A preview-only check or dry-run is never accepted as final
 * evidence (ADR-014 / PRD Appendix D constraint 10).
 */
const verifySourceApplied = async (
  absolutePath: string,
  startLine: number,
  expectedLines: readonly string[],
): Promise<VerificationResult> => {
  const content = await readFile(absolutePath, "utf-8");
  const lines = content.split("\n");
  const startIdx = startLine - 1;
  const actualSlice = lines.slice(startIdx, startIdx + expectedLines.length);

  if (expectedLines.length === 0) {
    return {
      sourceVerified: true,
      detail: `source verified: no content lines to assert (empty addition set)`,
    };
  }

  const sourceVerified = expectedLines.every(
    (expected, i) => actualSlice[i] !== undefined && actualSlice[i] === expected,
  );

  return {
    sourceVerified,
    detail: sourceVerified
      ? `source verified: ${expectedLines.length} line(s) match at line ${startLine}`
      : `source verification FAILED: expected ${expectedLines.join(" | ")}; found ${actualSlice.join(" | ")}`,
  };
};

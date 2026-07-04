/**
 * Workspace design-token registry construction (VC-V1V2-18 / task 9 / C2).
 *
 * Builds a unified {@link InMemoryTokenRegistry} from the workspace data the
 * source pipeline already discovered:
 *  - Tailwind v3 config tokens (via `registerTailwindTokens` from
 *    `@vision-control/tailwind`), with `tailwind-v3-config` provenance.
 *  - Plain CSS custom properties extracted from `:root` blocks in the
 *    workspace's `.css`/`.scss` files (via `extractCssCustomProperties`),
 *    with `css-custom-property` provenance.
 *
 * The registry is the single source feeding `compileContext`'s `tokenRegistry`
 * input: `registry.summary()` emits the compact token section, and
 * `detectTokenConflicts(registry.registrations())` emits value conflicts as
 * agent-facing warnings.
 *
 * The Tailwind v4 `@theme` registry (task 11) flows through once task 12 wires
 * it into the adapter; for now the registry is built from whatever the adapter
 * surface provides (v3 config + CSS custom properties).
 *
 * Platform: node. No filesystem access — callers pass already-discovered data.
 * Paths are workspace-relative (never absolute), matching the
 * {@link SourceCandidate} invariant.
 */

import {
  detectTokenConflicts,
  extractCssCustomProperties,
  formatConflictWarning,
  InMemoryTokenRegistry,
  TOKEN_CONFLICT_WARNING_CODE,
  type TokenRegistry,
  type TokenRegistrySummary,
} from "@vision-control/source-resolver";
import type { TailwindConfigInput } from "@vision-control/tailwind";
import { registerTailwindTokens } from "@vision-control/tailwind";

const CSS_EXTENSIONS = new Set([".css", ".scss"]);

const isCssFile = (workspaceRelativePath: string): boolean =>
  CSS_EXTENSIONS.has(
    workspaceRelativePath.slice(Math.max(0, workspaceRelativePath.lastIndexOf("."))).toLowerCase(),
  );

/** Inputs to {@link buildWorkspaceTokenRegistry}. */
export interface WorkspaceTokenRegistryInput {
  /** Resolved Tailwind v3 config + its workspace-relative path, when present. */
  readonly tailwind:
    | { readonly config: TailwindConfigInput; readonly configPath: string }
    | undefined;
  /**
   * Workspace source-file contents (relPath → content), as already discovered
   * by `discoverSourceFileContents`. Only `.css`/`.scss` entries are scanned
   * for custom properties — the map is reused, never re-walked.
   */
  readonly sourceFiles: ReadonlyMap<string, string>;
}

/**
 * Build a workspace {@link TokenRegistry} from discovered data. The registry is
 * always returned (never `undefined`) so the pipeline can pass it through
 * unconditionally; an empty workspace yields an empty registry whose
 * `summary()` the adapter omits from the compiled context.
 */
export const buildWorkspaceTokenRegistry = (input: WorkspaceTokenRegistryInput): TokenRegistry => {
  const registry = new InMemoryTokenRegistry();

  if (input.tailwind !== undefined) {
    registerTailwindTokens(registry, input.tailwind.config, {
      configPath: input.tailwind.configPath,
    });
  }

  for (const [relPath, content] of input.sourceFiles) {
    if (!isCssFile(relPath)) continue;
    const tokens = extractCssCustomProperties(content, relPath);
    if (tokens.length > 0) registry.registerMany(tokens);
  }

  return registry;
};

/** A conflict warning shaped for the compiled context `warnings` array. */
export interface TokenConflictWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: "warning";
  readonly source: string;
}

export interface CompiledTokenSection {
  /** Absent when the registry is empty — the misleading-success-output guard. */
  readonly tokenRegistry?: TokenRegistrySummary;
  readonly warnings: readonly TokenConflictWarning[];
}

/**
 * Reduce a workspace {@link TokenRegistry} into the slice `compileContext`
 * consumes: the summary (omitted when empty) plus one `token-conflict` warning
 * per name whose sources disagree on value. Pure; safe to call with `undefined`.
 */
export const compileTokenRegistrySection = (
  registry: TokenRegistry | undefined,
): CompiledTokenSection => {
  if (registry === undefined || registry.size === 0) return { warnings: [] };
  const tokenRegistry = registry.summary();
  if (tokenRegistry.conflictCount === 0) return { tokenRegistry, warnings: [] };
  const warnings: TokenConflictWarning[] = detectTokenConflicts(registry.registrations()).map(
    (conflict) => ({
      code: TOKEN_CONFLICT_WARNING_CODE,
      message: formatConflictWarning(conflict),
      severity: "warning",
      source: "token-registry",
    }),
  );
  return { tokenRegistry, warnings };
};

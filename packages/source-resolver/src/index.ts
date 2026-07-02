/**
 * @vision-control/source-resolver — public API.
 *
 * Resolves a {@link SelectionIdentity} (from the inspector) to a
 * {@link SourceCandidate} that the context compiler and MCP server hand to a
 * coding agent.
 *
 * Resolution priority: source marker (high) → stale registry (medium) → static
 * CSS class (medium) → low-confidence fallback (low). The resolver NEVER returns
 * a wrong HIGH-confidence result.
 *
 * Platform: node — the snippet extractor reads source files via `node:fs`.
 * SECURITY: every path in a {@link SourceCandidate} is workspace-relative.
 */

export { type ResolveOptions, SourceResolver, type SourceResolverOptions } from "./resolver.js";
export { extractSnippet, MAX_SNIPPET_LINES } from "./snippet-extractor.js";
export {
  createSourceCandidate,
  type SourceCandidate,
  SourceCandidateSchema,
  type SourceConfidence,
} from "./source-candidate.js";
export { isStaleEntry } from "./stale-detection.js";
export {
  CSS_MODULES_STUB,
  checkCssModulesSupport,
  checkTailwindTokenSupport,
  TAILWIND_TOKEN_STUB,
  type V1StubResult,
} from "./v1-stubs.js";

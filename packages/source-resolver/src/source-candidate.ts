import { z } from "zod";

/**
 * Source candidate schema (PRD 14.5 / 16.2).
 *
 * A `SourceCandidate` is the resolver's best-effort answer to "where in the
 * source does this DOM element come from?" It carries the workspace-relative
 * path, source range, component name, an optional code snippet, and — when the
 * resolution came from a static CSS class — the CSS file and line where the
 * class is defined.
 *
 * SECURITY: every path field is workspace-relative. An absolute filesystem path
 * can never appear in a SourceCandidate. The `workspaceRelativePath` and
 * `cssFilePath` are the only location identifiers a consumer ever receives.
 */
export const SourceCandidateSchema = z.object({
  sourceId: z.string().min(1).optional(),
  workspaceRelativePath: z.string().min(1).optional(),
  startLine: z.number().int().nonnegative().optional(),
  startColumn: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
  endColumn: z.number().int().nonnegative().optional(),
  componentName: z.string().min(1).optional(),
  snippet: z.string().optional(),
  staticClassName: z.string().min(1).optional(),
  cssFilePath: z.string().min(1).optional(),
  cssLine: z.number().int().positive().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()),
});

export type SourceCandidate = z.infer<typeof SourceCandidateSchema>;

export type SourceConfidence = SourceCandidate["confidence"];

/** Build a validated candidate. Use this at every construction boundary. */
export const createSourceCandidate = (
  input: Omit<SourceCandidate, "warnings"> & { readonly warnings?: readonly string[] },
): SourceCandidate =>
  SourceCandidateSchema.parse({
    ...input,
    ...(input.warnings !== undefined ? { warnings: [...input.warnings] } : { warnings: [] }),
  });

import { z } from "zod";

import {
  type Confidence,
  type ConfidenceEvidence,
  ConfidenceEvidenceSchema,
  ConfidenceSchema,
  satisfiesHighEvidence,
} from "./confidence.js";

/**
 * Source candidate schema (PRD 14.5 / 16.2 / VC-V1V2-04).
 *
 * A `SourceCandidate` is the resolver's best-effort answer to "where in the
 * source does this DOM element come from?" It carries the workspace-relative
 * path, source range, component name, an optional code snippet, and — when the
 * resolution came from a static CSS class — the CSS file and line where the
 * class is defined.
 *
 * VC-V1V2-04 extends the candidate with the adapter-confidence contract:
 * - `evidence` — the {@link ConfidenceEvidence} methods that produced this
 *   candidate. Drives the never-wrong-HIGH policy.
 * - `ownershipRisk` — risk that this source location does NOT actually own the
 *   element's styling/structure (e.g. a generated class, a dynamic
 *   `props.className`). Informational; does not override confidence.
 * - `selected` — `true` on the candidate the resolver picked; `false` on the
 *   alternatives. Multiple candidates per element are first-class.
 * - `alternativeCount` — how many OTHER candidates the resolver surfaced for
 *   the same element (the ambiguity signal).
 *
 * SECURITY: every path field is workspace-relative. An absolute filesystem path
 * can never appear in a SourceCandidate. The `workspaceRelativePath` and
 * `cssFilePath` are the only location identifiers a consumer ever receives.
 *
 * All VC-V1V2-04 fields are OPTIONAL so the schema stays backward-compatible
 * with the MVP candidates the context compiler and tests already build. The
 * resolver always populates them for adapter-derived candidates.
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
  confidence: ConfidenceSchema,
  warnings: z.array(z.string()),
  // VC-V1V2-04 adapter-confidence contract (all optional for backward compat):
  evidence: z.array(ConfidenceEvidenceSchema).optional(),
  ownershipRisk: z.enum(["none", "low", "medium", "high"]).optional(),
  selected: z.boolean().optional(),
  alternativeCount: z.number().int().nonnegative().optional(),
});

export type SourceCandidate = z.infer<typeof SourceCandidateSchema>;

export type SourceConfidence = Confidence;

/**
 * True when the candidate carries a concrete source range — the precondition
 * for the `source-map` HIGH path.
 */
export const hasSourceRange = (
  candidate: Pick<SourceCandidate, "startLine" | "endLine">,
): boolean => candidate.startLine !== undefined && candidate.endLine !== undefined;

/**
 * Build a validated candidate. Use this at every construction boundary. Unknown
 * evidence methods are rejected here (the schema enum guards the value space).
 */
export const createSourceCandidate = (
  input: Omit<SourceCandidate, "warnings"> & { readonly warnings?: readonly string[] },
): SourceCandidate =>
  SourceCandidateSchema.parse({
    ...input,
    ...(input.warnings !== undefined ? { warnings: [...input.warnings] } : { warnings: [] }),
  });

const NEVER_WRONG_HIGH_DOWNGRADE =
  "downgraded by never-wrong-HIGH policy: evidence does not qualify for HIGH";

/**
 * Enforce the never-wrong-HIGH policy on a single candidate.
 *
 * If the candidate claims `confidence: "high"` but its evidence does not satisfy
 * {@link satisfiesHighEvidence} (given whether it carries a source range), it is
 * downgraded to `"medium"` and a warning is appended. Candidates that are
 * already MEDIUM or LOW are returned unchanged. The policy is enforced even
 * when the adapter lied — this is the load-bearing guardrail.
 */
export const enforceNeverWrongHigh = (candidate: SourceCandidate): SourceCandidate => {
  if (candidate.confidence !== "high") return candidate;
  const evidence = candidate.evidence ?? [];
  if (satisfiesHighEvidence(evidence, hasSourceRange(candidate))) return candidate;
  return {
    ...candidate,
    confidence: "medium",
    warnings: [...candidate.warnings, NEVER_WRONG_HIGH_DOWNGRADE],
  };
};

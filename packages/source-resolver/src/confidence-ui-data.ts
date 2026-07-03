import { z } from "zod";

import {
  type ConfidenceEvidence,
  ConfidenceEvidenceSchema,
  ConfidenceSchema,
} from "./confidence.js";
import type { SourceCandidate } from "./source-candidate.js";

/**
 * Confidence UI data shape (VC-V1V2-04 / PRD 18.5).
 *
 * This is the DATA shape the source-confidence UI will consume — NOT the UI
 * itself. It is built from the resolver's flat candidate list by
 * {@link buildConfidenceUiData} and flows through the context compiler to the
 * MCP response (and, later, the DevTools panel). The UI task (VC-V1V2-10) is
 * the only consumer allowed to render it; this task only defines and exports
 * the shape.
 *
 * The shape intentionally avoids nesting full candidate objects inside each
 * other (the context compiler's `redactObject` treats shared references as
 * circular). A selected candidate and its alternatives are separate flat
 * projections.
 */

/** One candidate projected for UI consumption. */
export const ConfidenceCandidateViewSchema = z.object({
  sourceId: z.string().optional(),
  workspaceRelativePath: z.string().min(1).optional(),
  startLine: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
  componentName: z.string().min(1).optional(),
  staticClassName: z.string().min(1).optional(),
  cssFilePath: z.string().min(1).optional(),
  snippet: z.string().optional(),
  confidence: ConfidenceSchema,
  /** Evidence method badges to render (e.g. `["marker"]`, `["manifest","source-map"]`). */
  methodBadge: z.array(ConfidenceEvidenceSchema),
  /** Human-readable reason/warning badges (the candidate's `warnings`). */
  reasonBadges: z.array(z.string()),
  ownershipRisk: z.enum(["none", "low", "medium", "high"]).optional(),
});
export type ConfidenceCandidateView = z.infer<typeof ConfidenceCandidateViewSchema>;

/**
 * The full UI data shape: the selected candidate (if any), the alternative
 * candidates, and two derived boolean markers the UI toggles on.
 */
export const ConfidenceUiDataSchema = z.object({
  selected: ConfidenceCandidateViewSchema.optional(),
  alternatives: z.array(ConfidenceCandidateViewSchema),
  /** True when more than one candidate was surfaced (ambiguity). */
  ambiguous: z.boolean(),
  /** True when a warning indicates repeated DOM instances share one source id. */
  repeatedInstance: z.boolean(),
  /** True when a warning indicates the stored fingerprint diverged (stale). */
  staleFingerprint: z.boolean(),
});
export type ConfidenceUiData = z.infer<typeof ConfidenceUiDataSchema>;

const REPEATED_INSTANCE_RE = /repeated instance/i;
const STALE_RE = /stale/i;

const projectView = (candidate: SourceCandidate): ConfidenceCandidateView => ({
  ...(candidate.sourceId !== undefined ? { sourceId: candidate.sourceId } : {}),
  ...(candidate.workspaceRelativePath !== undefined
    ? { workspaceRelativePath: candidate.workspaceRelativePath }
    : {}),
  ...(candidate.startLine !== undefined ? { startLine: candidate.startLine } : {}),
  ...(candidate.endLine !== undefined ? { endLine: candidate.endLine } : {}),
  ...(candidate.componentName !== undefined ? { componentName: candidate.componentName } : {}),
  ...(candidate.staticClassName !== undefined
    ? { staticClassName: candidate.staticClassName }
    : {}),
  ...(candidate.cssFilePath !== undefined ? { cssFilePath: candidate.cssFilePath } : {}),
  ...(candidate.snippet !== undefined ? { snippet: candidate.snippet } : {}),
  confidence: candidate.confidence,
  methodBadge: [...(candidate.evidence ?? [])] as ConfidenceEvidence[],
  reasonBadges: [...candidate.warnings],
  ...(candidate.ownershipRisk !== undefined ? { ownershipRisk: candidate.ownershipRisk } : {}),
});

/**
 * Build the UI data shape from the resolver's flat candidate list.
 *
 * The selected candidate is the one flagged `selected: true` (or, falling back,
 * the highest-confidence candidate). All other candidates become alternatives.
 * `ambiguous` is true when there is more than one candidate. The
 * `repeatedInstance` and `staleFingerprint` markers are derived from the
 * selected candidate's warnings (case-insensitive substring match) so the UI can
 * toggle dedicated affordances without re-parsing free text.
 */
export const buildConfidenceUiData = (candidates: readonly SourceCandidate[]): ConfidenceUiData => {
  if (candidates.length === 0) {
    return { alternatives: [], ambiguous: false, repeatedInstance: false, staleFingerprint: false };
  }
  const selectedCandidate = candidates.find((c) => c.selected === true) ?? candidates[0];
  const alternatives = candidates.filter((c) => c !== selectedCandidate).map(projectView);
  const selected = selectedCandidate !== undefined ? projectView(selectedCandidate) : undefined;
  const selectedWarnings = selectedCandidate?.warnings ?? [];
  return {
    ...(selected !== undefined ? { selected } : {}),
    alternatives,
    ambiguous: candidates.length > 1,
    repeatedInstance: selectedWarnings.some((w) => REPEATED_INSTANCE_RE.test(w)),
    staleFingerprint: selectedWarnings.some((w) => STALE_RE.test(w)),
  };
};

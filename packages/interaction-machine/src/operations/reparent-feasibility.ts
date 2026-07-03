import type { ElementRef } from "@vision-control/element-identity";
import type { ValidateReparentResult } from "@vision-control/layout-engine";

/**
 * Reparent feasibility analysis (PRD §9.4). Extracted from {@link reparent.ts}
 * to keep both modules under the 250 pure-LOC ceiling. This module owns the
 * risk taxonomy, the descriptor that carries risk metadata, and the
 * {@link buildFeasibility} evaluator. The session state machine in
 * {@link reparent.ts} consumes the report.
 *
 * PRD §9.4 separates runtime preview success from source-level feasibility:
 * the runtime preview may commit (reversible), but the source patch is gated by
 * {@link FeasibilityReport.sourcePatch}. An `unsafe` source patch blocks
 * auto-commit entirely; an `agent-required` patch may preview but must be
 * applied by an agent, never automatically.
 */

/**
 * Enriched element descriptor used by the reparent evaluator. Carries the
 * element reference plus the metadata needed for content-model guards and risk
 * analysis. Every optional flag maps to one or more PRD §9.4 risks; the browser
 * adapter populates them from the live DOM / framework adapters.
 *
 * Field → PRD §9.4 risk mapping:
 * - `isPortal` — React Portal boundary
 * - `isRepeatedInstance` — repeated-render instance
 * - `isProvider` — provider/utility wrapper target
 * - `sourceFile` — source mapping (missing → `source-file`; differing +
 *   `hasPropDependency` → `cross-file-prop-dependency`)
 * - `isLabelControl` — `<label>` association (set from a11y role/labelledby)
 * - `isFormField` — form ownership
 * - `isInShadowRoot` — slot/Shadow DOM boundary
 * - `isRenderPropChild` — render-prop child
 * - `isContextConsumer` / `isContextProvider` — context provider boundary
 * - `isServerComponent` — server/client component boundary (populated from the
 *   Next adapter metadata when available)
 * - `hasPropDependency` — cross-file prop dependency
 */
export interface ReparentElementDescriptor {
  readonly ref: ElementRef;
  readonly tagName: string;
  readonly isPortal?: boolean;
  readonly isProvider?: boolean;
  readonly isRepeatedInstance?: boolean;
  readonly sourceFile?: string;
  readonly isLabelControl?: boolean;
  readonly isFormField?: boolean;
  readonly isInShadowRoot?: boolean;
  readonly isRenderPropChild?: boolean;
  readonly isContextConsumer?: boolean;
  readonly isContextProvider?: boolean;
  readonly isServerComponent?: boolean;
  readonly hasPropDependency?: boolean;
}

/**
 * Risk kinds that lower source-patch confidence (PRD §9.4:568-579). Exactly 12
 * kinds covering every PRD §9.4 bullet:
 *
 * 1. `portal` — React Portal boundary
 * 2. `content-model` — table/ul/select structural violations
 * 3. `form-ownership` — form field reparented out of its `<form>`
 * 4. `label-association` — `<label>`'s control reparented
 * 5. `slot-shadow-boundary` — shadow DOM slot boundary crossing
 * 6. `repeated-instance` — repeated-render instance moved alone
 * 7. `render-prop` — render-prop child
 * 8. `context-provider-outside` — context consumer moved outside its provider
 * 9. `source-file` — missing source mapping
 * 10. `cross-file-prop-dependency` — different files with a prop dependency
 * 11. `server-client-boundary` — server/client component boundary
 * 12. `provider` — provider/utility wrapper target
 */
export type ReparentRiskKind =
  | "portal"
  | "repeated-instance"
  | "provider"
  | "source-file"
  | "content-model"
  | "label-association"
  | "form-ownership"
  | "slot-shadow-boundary"
  | "render-prop"
  | "context-provider-outside"
  | "server-client-boundary"
  | "cross-file-prop-dependency";

export interface ReparentRisk {
  readonly kind: ReparentRiskKind;
  readonly reason: string;
}

export type ReparentConfidence = "high" | "medium" | "low";

/**
 * Source-patch feasibility per PRD §9.4:586. The runtime preview success is
 * tracked separately (on {@link FeasibilityReport.canReparent}); this field
 * gates whether the source change can be applied automatically.
 *
 * - `deterministic` — no risks; the source patch is safe to apply.
 * - `agent-required` — risks are present but the preview may proceed; an agent
 *   must author the source patch.
 * - `unsafe` — a framework-boundary risk fires; auto-commit is blocked and the
 *   reparent must be rejected (no runtime preview).
 */
export type SourcePatchFeasibility = "deterministic" | "agent-required" | "unsafe";

/**
 * Feasibility report shown in the panel. It is separate from the binary
 * valid/invalid drop evaluation so the UI can explain why an operation may be
 * risky even when it is structurally allowed.
 */
export interface FeasibilityReport {
  readonly canReparent: boolean;
  readonly sourcePatch: SourcePatchFeasibility;
  readonly confidence: ReparentConfidence;
  readonly risks: readonly ReparentRisk[];
}

/**
 * Risk kinds that cross framework boundaries and make a deterministic source
 * patch unsafe. When any of these fire, {@link endReparent} rejects the
 * reparent — no auto-commit (PRD §9.4:566 "즉시 commit하지 않는다").
 */
const UNSAFE_KINDS: ReadonlySet<ReparentRiskKind> = new Set<ReparentRiskKind>([
  "slot-shadow-boundary",
  "render-prop",
  "server-client-boundary",
  "cross-file-prop-dependency",
]);

const contentModelRisk = (parentTag: string, childTag: string): ReparentRisk => ({
  kind: "content-model",
  reason: `<${childTag}> is not a permitted direct child of <${parentTag}>`,
});

const lowerTag = (tag: string): string => tag.trim().toLowerCase();

/**
 * Build the feasibility report for a reparent (PRD §9.4). Evaluates all 12 risk
 * kinds from the element and target-parent metadata plus the content-model
 * guard result.
 */
export const buildFeasibility = (
  element: ReparentElementDescriptor,
  targetParent: ReparentElementDescriptor | null,
  contentModel: ValidateReparentResult,
): FeasibilityReport => {
  const risks: ReparentRisk[] = [];

  if (!contentModel.ok) {
    risks.push(contentModelRisk(contentModel.violation.parent, contentModel.violation.child));
  }
  if (element.isPortal) {
    risks.push({ kind: "portal", reason: "Dragged element originates from a React portal" });
  }
  if (element.isRepeatedInstance) {
    risks.push({
      kind: "repeated-instance",
      reason: "Repeated runtime instance from the same source line",
    });
  }
  if (targetParent?.isProvider) {
    risks.push({ kind: "provider", reason: "Target parent is a provider/utility wrapper" });
  }
  if (element.sourceFile === undefined || targetParent?.sourceFile === undefined) {
    risks.push({ kind: "source-file", reason: "Missing source mapping for element or target" });
  }

  if (element.isLabelControl) {
    risks.push({
      kind: "label-association",
      reason: "Reparenting a <label>'s control breaks the label association",
    });
  }
  if (element.isFormField && targetParent !== null && lowerTag(targetParent.tagName) !== "form") {
    risks.push({
      kind: "form-ownership",
      reason: "Reparenting a form field out of its <form> changes form ownership",
    });
  }
  if (
    targetParent !== null &&
    (element.isInShadowRoot ?? false) !== (targetParent.isInShadowRoot ?? false)
  ) {
    risks.push({
      kind: "slot-shadow-boundary",
      reason: "Reparenting across a shadow DOM slot boundary",
    });
  }
  if (element.isRenderPropChild) {
    risks.push({ kind: "render-prop", reason: "Target source is inside a render prop" });
  }
  if (
    targetParent !== null &&
    (element.isContextConsumer ?? false) &&
    !(targetParent.isContextProvider ?? false)
  ) {
    risks.push({
      kind: "context-provider-outside",
      reason: "Reparenting a context consumer outside its provider",
    });
  }
  if (
    targetParent !== null &&
    (element.isServerComponent ?? false) !== (targetParent.isServerComponent ?? false)
  ) {
    risks.push({
      kind: "server-client-boundary",
      reason: "Reparenting across a server/client component boundary",
    });
  }
  if (
    element.sourceFile !== undefined &&
    targetParent?.sourceFile !== undefined &&
    element.sourceFile !== targetParent.sourceFile &&
    (element.hasPropDependency ?? false)
  ) {
    risks.push({
      kind: "cross-file-prop-dependency",
      reason: "Source and target parents are in different files with a prop dependency",
    });
  }

  const canReparent = contentModel.ok;
  const confidence: ReparentConfidence =
    risks.length === 0 ? "high" : risks.some((r) => r.kind === "source-file") ? "low" : "medium";
  const sourcePatch: SourcePatchFeasibility =
    risks.length === 0
      ? "deterministic"
      : risks.some((r) => UNSAFE_KINDS.has(r.kind))
        ? "unsafe"
        : "agent-required";

  return { canReparent, sourcePatch, confidence, risks };
};

export const initialFeasibility: FeasibilityReport = {
  canReparent: false,
  sourcePatch: "agent-required",
  confidence: "low",
  risks: [{ kind: "content-model", reason: "No drop target evaluated yet" }],
};

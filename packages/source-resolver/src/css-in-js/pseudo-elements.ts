/**
 * Pseudo-element editing: source-origin resolution and operation schema
 * (VC-V1V2-20 / PRD 7.3, 12.4).
 *
 * Supports editing `::before` / `::after` (content, color) and pseudo states
 * (`:hover`, `:focus`, `:active`, `:disabled`). The source origin is the CSS
 * rule (or CSS-in-JS definition) that defines the pseudo-element; when an AST
 * pins that rule to a concrete source range the candidate is HIGH (ast-origin),
 * otherwise it is MEDIUM (text-search) and the edit is agent-required.
 *
 * The operation schema is an ADDITIVE local extension: change-ir's
 * `style-edit` operation carries no `pseudoClass` field (and change-ir is
 * frozen for this task), so a {@link PseudoElementEdit} wraps a style-edit-like
 * intent plus the `pseudoClass` that names the pseudo target. The runtime
 * preview (preview-engine/pseudo-preview.ts) consumes this schema to synthesize
 * a preview CSS rule; it does NOT mutate the live CSSOM as source truth.
 */

import { z } from "zod";

import { createSourceCandidate, type SourceCandidate } from "../source-candidate.js";

/** Pseudo-elements supported for content/color editing. */
export const PSEUDO_ELEMENTS = ["::before", "::after"] as const;
export type PseudoElementKind = (typeof PSEUDO_ELEMENTS)[number];

/** Pseudo states supported for state-scoped edits. */
export const PSEUDO_STATES = [":hover", ":focus", ":active", ":disabled"] as const;
export type PseudoStateKind = (typeof PSEUDO_STATES)[number];

/** Any pseudo target (element or state). */
export type PseudoTargetKind = PseudoElementKind | PseudoStateKind;

export const PseudoTargetKindSchema = z.enum([...PSEUDO_ELEMENTS, ...PSEUDO_STATES]);

const AGENT_REQUIRED_NO_RULE =
  "agent-required: pseudo-element rule not located in source — no deterministic origin";

/**
 * The additive pseudo-element edit schema. Mirrors a `style-edit` operation's
 * property/value shape, extended with `pseudoClass` (the pseudo target) and the
 * target element's runtime id (the preview selector key). Validated via Zod so
 * malformed inputs (unknown pseudo class, empty property) are rejected at the
 * boundary.
 */
export const PseudoElementEditSchema = z.object({
  /** Runtime id of the host element (the element the pseudo is attached to). */
  runtimeId: z.string().min(1),
  /** The pseudo target: `::before`, `::after`, `:hover`, `:focus`, ... */
  pseudoClass: PseudoTargetKindSchema,
  /** CSS property to edit (e.g. `content`, `color`). */
  property: z.string().min(1),
  /** New value for the property. */
  value: z.string(),
  /** Previous value, captured for a lossless inverse (optional). */
  previousValue: z.string().optional(),
});

export type PseudoElementEdit = z.infer<typeof PseudoElementEditSchema>;

/**
 * A CSS rule that defines a pseudo-element/pseudo-state, located in source.
 * The `astOwned` flag records whether an AST pinned this rule (drives the
 * HIGH vs MEDIUM confidence split).
 */
export interface PseudoElementRule {
  readonly selector: string;
  readonly pseudoClass: PseudoTargetKind;
  readonly property: string;
  readonly value: string;
  readonly workspaceRelativePath: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** `true` when an AST walk located this rule (enables ast-origin HIGH). */
  readonly astOwned: boolean;
  readonly componentName?: string;
}

/**
 * Resolve the source origin of a pseudo-element/pseudo-state rule.
 *
 * - AST-owned rule + concrete range -> HIGH with `ast-origin` (solo-strong).
 * - Otherwise -> MEDIUM with `text-search` and an agent-required warning.
 *
 * Never-wrong-HIGH compliant: the HIGH path cites `ast-origin` + a range; the
 * MEDIUM path cites only `text-search`.
 */
export const resolvePseudoElementOrigin = (rule: PseudoElementRule): SourceCandidate => {
  if (rule.astOwned) {
    return createSourceCandidate({
      workspaceRelativePath: rule.workspaceRelativePath,
      startLine: rule.startLine,
      startColumn: rule.startColumn,
      endLine: rule.endLine,
      endColumn: rule.endColumn,
      ...(rule.componentName !== undefined ? { componentName: rule.componentName } : {}),
      snippet: `  ${rule.selector} { ${rule.property}: ${rule.value}; }`,
      cssFilePath: rule.workspaceRelativePath,
      cssLine: rule.startLine + 1,
      staticClassName: rule.selector,
      confidence: "high",
      evidence: ["ast-origin"],
      warnings: [],
      ownershipRisk: "low",
    });
  }
  return createSourceCandidate({
    workspaceRelativePath: rule.workspaceRelativePath,
    ...(rule.componentName !== undefined ? { componentName: rule.componentName } : {}),
    staticClassName: rule.selector,
    cssFilePath: rule.workspaceRelativePath,
    cssLine: rule.startLine + 1,
    confidence: "medium",
    evidence: ["text-search"],
    warnings: [AGENT_REQUIRED_NO_RULE],
    ownershipRisk: "medium",
  });
};

/** Build a pseudo-element edit intent, validated against the schema. */
export const buildPseudoElementEdit = (input: PseudoElementEdit): PseudoElementEdit =>
  PseudoElementEditSchema.parse(input);

/**
 * Daemon-facing pseudo-element edit descriptor: the validated edit, its preview
 * selector, and the resolved source origin (null when no rule was located — the
 * agent-required case). Node-only: the browser side produces `pseudo-style-edit`
 * change-ir ops directly and never imports this (boundary checker enforces it).
 */
export interface PseudoElementEditRequest {
  readonly edit: PseudoElementEdit;
  readonly previewSelector: string;
  readonly origin: SourceCandidate | null;
}

export const resolvePseudoElementEdit = (
  input: PseudoElementEdit,
  rule?: PseudoElementRule,
): PseudoElementEditRequest => {
  const edit = buildPseudoElementEdit(input);
  const previewSelector = pseudoPreviewSelector(edit.runtimeId, edit.pseudoClass);
  const origin = rule !== undefined ? resolvePseudoElementOrigin(rule) : null;
  return { edit, previewSelector, origin };
};

/**
 * Build the preview CSS selector for a pseudo-element/state edit. The host
 * element is targeted by its preview-id attribute; the pseudo class appends.
 * E.g. `rt-001` + `::before` -> `[data-vc-preview-id="rt-001"]::before`.
 *
 * Pure string construction — no DOM access. The preview engine consumes this.
 */
export const pseudoPreviewSelector = (runtimeId: string, pseudoClass: PseudoTargetKind): string =>
  `[data-vc-preview-id="${runtimeId}"]${pseudoClass}`;

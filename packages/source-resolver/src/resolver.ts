import { join } from "node:path";

import type { SelectionIdentity } from "@vision-control/element-identity";
import type { SourceRegistry } from "@vision-control/source-registry";
import type { CssTokenIndex } from "@vision-control/workspace-index";
import type { AdapterContext } from "./adapter-contract.js";
import type { AdapterRegistry } from "./adapter-registry.js";
import { type Confidence, type ConfidenceEvidence, compareConfidence } from "./confidence.js";
import { extractSnippet } from "./snippet-extractor.js";
import {
  createSourceCandidate,
  enforceNeverWrongHigh,
  type SourceCandidate,
} from "./source-candidate.js";
import { isStaleEntry } from "./stale-detection.js";

/**
 * Additional context the resolver needs that {@link SelectionIdentity} does not
 * carry. Both fields are optional; when absent the corresponding fallback path
 * is skipped.
 */
export interface ResolveOptions {
  /**
   * CSS class names currently on the element. Used for the static-class-token
   * fallback when no source marker resolves.
   */
  readonly cssClasses?: readonly string[];
  /**
   * Number of live DOM elements that share the same source id. When > 1 the
   * resolver cannot tell WHICH instance was selected without runtime-id context
   * (e.g. list items rendered from one `.map()`). The marker candidate is
   * downgraded to medium with a "repeated instance ambiguity" warning.
   */
  readonly runtimeInstanceCount?: number;
}

export interface SourceResolverOptions {
  readonly registry: SourceRegistry;
  readonly cssTokenIndex: CssTokenIndex;
  readonly workspaceRoot: string;
  /**
   * Adapter registry consulted after the built-in marker/CSS cascade
   * (VC-V1V2-04). Optional for backward compatibility — when absent the
   * resolver behaves exactly as the MVP resolver did.
   */
  readonly adapters?: AdapterRegistry;
}

/** Sort comparator: higher confidence first. */
const byConfidence = (a: SourceCandidate, b: SourceCandidate): number =>
  compareConfidence(a.confidence as Confidence, b.confidence as Confidence);

const MARKER_EVIDENCE: readonly ConfidenceEvidence[] = ["marker"];
const TEXT_SEARCH_EVIDENCE: readonly ConfidenceEvidence[] = ["text-search"];

/**
 * Source resolver (PRD 14.5 / VC-V1V2-04).
 *
 * Given a {@link SelectionIdentity} from the inspector, resolves it to source
 * candidates using a fixed priority cascade PLUS any registered adapters:
 *
 * 1. Source marker (HIGH) — the element carries a `data-vc-source` id that the
 *    registry maps to a source location. When the fingerprint still matches and
 *    only one DOM instance shares the id, confidence is HIGH.
 * 2. Stale registry downgrade (MEDIUM) — the marker resolves but the stored
 *    fingerprint differs from the element's current one (HMR / re-render).
 * 3. Repeated-instance ambiguity (MEDIUM) — multiple DOM elements share one
 *    source id; the resolver cannot pick the instance without runtime context.
 * 4. Static CSS class origin (MEDIUM) — no marker, but a CSS class on the
 *    element matches a definition in the CSS token index.
 * 5. Registered adapters (variable) — each registered {@link SourceAdapter}
 *    contributes candidates. The never-wrong-HIGH policy is enforced on every
 *    adapter candidate; an adapter that claims HIGH without strong evidence is
 *    downgraded to MEDIUM with a warning.
 * 6. Low-confidence fallback (LOW) — none of the above.
 *
 * The resolver NEVER returns a wrong HIGH-confidence result. Any uncertainty
 * (stale, ambiguous, conflicting, missing, or an adapter that lies) downgrades
 * to MEDIUM or LOW with an explanatory warning.
 */
export class SourceResolver {
  constructor(private readonly opts: SourceResolverOptions) {}

  /**
   * Resolve ALL candidates for the element: built-in marker/CSS cascade plus
   * every registered adapter, with the never-wrong-HIGH policy enforced on each.
   * The highest-confidence candidate is flagged `selected: true`; the rest are
   * alternatives. When nothing resolves, a single LOW fallback candidate is
   * returned (flagged selected).
   */
  resolveCandidates(
    identity: SelectionIdentity,
    options?: ResolveOptions,
  ): readonly SourceCandidate[] {
    const collected: SourceCandidate[] = [];

    const marker = this.resolveByMarker(identity, options);
    if (marker !== undefined) collected.push(marker);

    const css = this.resolveByCssClass(options);
    if (css !== undefined) collected.push(css);

    const adapters = this.opts.adapters;
    if (adapters !== undefined && adapters.size > 0) {
      const context: AdapterContext = {
        identity,
        ...(options?.cssClasses !== undefined ? { cssClasses: options.cssClasses } : {}),
        ...(options?.runtimeInstanceCount !== undefined
          ? { runtimeInstanceCount: options.runtimeInstanceCount }
          : {}),
      };
      for (const adapter of adapters.list()) {
        for (const candidate of adapter.resolve(context)) {
          collected.push(candidate);
        }
      }
    }

    if (collected.length === 0) {
      return [this.fallbackCandidate()];
    }

    const enforced = collected.map(enforceNeverWrongHigh);
    enforced.sort(byConfidence);

    const total = enforced.length;
    return enforced.map((candidate, index) => ({
      ...candidate,
      selected: index === 0,
      alternativeCount: Math.max(0, total - 1),
    }));
  }

  /**
   * Resolve the single best (highest-confidence) candidate. Backward-compatible
   * with the MVP resolver API; delegates to {@link resolveCandidates}.
   */
  resolve(identity: SelectionIdentity, options?: ResolveOptions): SourceCandidate {
    const candidates = this.resolveCandidates(identity, options);
    const top = candidates[0];
    return top ?? this.fallbackCandidate();
  }

  private fallbackCandidate(): SourceCandidate {
    return createSourceCandidate({
      confidence: "low",
      evidence: [],
      warnings: ["unable to resolve source: no source marker and no matching CSS class"],
      ownershipRisk: "none",
      selected: true,
      alternativeCount: 0,
    });
  }

  private resolveByMarker(
    identity: SelectionIdentity,
    options: ResolveOptions | undefined,
  ): SourceCandidate | undefined {
    if (identity.sourceId === undefined) return undefined;
    const entry = this.opts.registry.lookup(identity.sourceId);
    if (entry === undefined) return undefined;

    const warnings: string[] = [];
    if (isStaleEntry(entry, identity.fingerprint)) {
      warnings.push("stale registry: element fingerprint changed since registration");
    }
    const instanceCount = options?.runtimeInstanceCount ?? 1;
    if (instanceCount > 1) {
      warnings.push(`repeated instance ambiguity: ${instanceCount} elements share this source id`);
    }

    const confidence = warnings.length > 0 ? "medium" : "high";
    const absPath = join(this.opts.workspaceRoot, entry.workspaceRelativePath);
    const snippet = extractSnippet(absPath, entry.range.startLine + 1, entry.range.endLine + 1);

    return createSourceCandidate({
      sourceId: entry.sourceId,
      workspaceRelativePath: entry.workspaceRelativePath,
      startLine: entry.range.startLine,
      startColumn: entry.range.startColumn,
      endLine: entry.range.endLine,
      endColumn: entry.range.endColumn,
      componentName: entry.componentName,
      ...(snippet !== undefined ? { snippet } : {}),
      confidence,
      evidence: [...MARKER_EVIDENCE],
      ownershipRisk: "none",
      warnings,
    });
  }

  private resolveByCssClass(options: ResolveOptions | undefined): SourceCandidate | undefined {
    const classes = options?.cssClasses;
    if (classes === undefined || classes.length === 0) return undefined;
    const className = classes[0] ?? "";
    if (className.length === 0) return undefined;
    const matches = this.opts.cssTokenIndex.lookup(className);
    if (matches.length === 1) {
      const token = matches[0];
      if (token !== undefined) {
        return createSourceCandidate({
          staticClassName: token.className,
          cssFilePath: token.workspaceRelativePath,
          cssLine: token.line,
          confidence: "medium",
          evidence: [...TEXT_SEARCH_EVIDENCE],
          ownershipRisk: "none",
          warnings: [],
        });
      }
    }
    if (matches.length > 1) {
      return createSourceCandidate({
        staticClassName: className,
        confidence: "low",
        evidence: [...TEXT_SEARCH_EVIDENCE],
        ownershipRisk: "low",
        warnings: [
          `conflicting candidates: class "${className}" defined in ${matches.length} locations`,
        ],
      });
    }
    return undefined;
  }
}

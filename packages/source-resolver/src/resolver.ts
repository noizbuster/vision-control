import { join } from "node:path";

import type { SelectionIdentity } from "@vision-control/element-identity";
import type { SourceRegistry } from "@vision-control/source-registry";
import type { CssTokenIndex } from "@vision-control/workspace-index";
import { extractSnippet } from "./snippet-extractor.js";
import { createSourceCandidate, type SourceCandidate } from "./source-candidate.js";
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
   * (e.g. list items rendered from one `.map()`). The result is downgraded to
   * medium with a "repeated instance ambiguity" warning.
   */
  readonly runtimeInstanceCount?: number;
}

export interface SourceResolverOptions {
  readonly registry: SourceRegistry;
  readonly cssTokenIndex: CssTokenIndex;
  readonly workspaceRoot: string;
}

/**
 * Source resolver (PRD 14.5).
 *
 * Given a {@link SelectionIdentity} from the inspector, resolves it to a single
 * {@link SourceCandidate} using a fixed priority cascade:
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
 * 5. Low-confidence fallback (LOW) — none of the above.
 *
 * The resolver NEVER returns a wrong HIGH-confidence result. Any uncertainty
 * (stale, ambiguous, conflicting, missing) downgrades to MEDIUM or LOW with an
 * explanatory warning.
 */
export class SourceResolver {
  constructor(private readonly opts: SourceResolverOptions) {}

  resolve(identity: SelectionIdentity, options?: ResolveOptions): SourceCandidate {
    if (identity.sourceId !== undefined) {
      const markerResult = this.resolveByMarker(identity, options);
      if (markerResult !== undefined) return markerResult;
    }
    return this.resolveByCssClass(options);
  }

  private resolveByMarker(
    identity: SelectionIdentity,
    options: ResolveOptions | undefined,
  ): SourceCandidate | undefined {
    const entry = this.opts.registry.lookup(identity.sourceId ?? "");
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
      warnings,
    });
  }

  private resolveByCssClass(options: ResolveOptions | undefined): SourceCandidate {
    const classes = options?.cssClasses;
    if (classes !== undefined && classes.length > 0) {
      const className = classes[0] ?? "";
      if (className.length > 0) {
        const matches = this.opts.cssTokenIndex.lookup(className);
        if (matches.length === 1) {
          const token = matches[0];
          if (token !== undefined) {
            return createSourceCandidate({
              staticClassName: token.className,
              cssFilePath: token.workspaceRelativePath,
              cssLine: token.line,
              confidence: "medium",
              warnings: [],
            });
          }
        }
        if (matches.length > 1) {
          return createSourceCandidate({
            staticClassName: className,
            confidence: "low",
            warnings: [
              `conflicting candidates: class "${className}" defined in ${matches.length} locations`,
            ],
          });
        }
      }
    }
    return createSourceCandidate({
      confidence: "low",
      warnings: ["unable to resolve source: no source marker and no matching CSS class"],
    });
  }
}

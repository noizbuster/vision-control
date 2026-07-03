/**
 * Source-resolution pipeline construction for the daemon (PRD §14.5 / §24.1 /
 * VC-V1V2-04).
 *
 * {@link buildSourcePipeline} wires the real-data V1 adapter factories into an
 * {@link AdapterRegistry}, builds a {@link WorkspaceIndex}, and constructs a
 * {@link SourceResolver} that owns the never-wrong-HIGH cascade. The data-less
 * singletons (`TAILWIND_TOKEN_ADAPTER` etc.) are NOT used here — only the
 * factories (`createTailwindTokenAdapter`, `createCssModulesAdapter`, …) wired
 * with workspace-discovered data. `VANILLA_CSS_ADAPTER` is deliberately NOT
 * registered (Task 45 implements the real vanilla adapter; the stub stays out
 * of production).
 *
 * {@link resolveSourceRequest} is the pure bridge between a §25.1 `source.request`
 * (carrying only `elementId`) and the resolver's `SelectionIdentity`-shaped API.
 * It is extracted as a pure function so the never-wrong-HIGH cascade is testable
 * without spawning a daemon.
 */

import { createCssModulesAdapter } from "@vision-control/css-modules";
import type { SelectionIdentity } from "@vision-control/element-identity";
import type { Logger } from "@vision-control/logger";
import { createNextAdapter } from "@vision-control/next-react";
import type { SourceEntry } from "@vision-control/source-registry";
import { SourceRegistry } from "@vision-control/source-registry";
import {
  type AdapterContext,
  AdapterRegistry,
  createCssInJsAdapter,
  type SourceAdapter,
  type SourceCandidate,
  SourceResolver,
} from "@vision-control/source-resolver";
import { createSvelteAdapter } from "@vision-control/svelte";
import { createTailwindTokenAdapter } from "@vision-control/tailwind";
import { createVueAdapter } from "@vision-control/vue";
import { WorkspaceIndex } from "@vision-control/workspace-index";
import {
  discoverCssModulesManifest,
  discoverCssSourceMaps,
  discoverSourceFileContents,
  resolveTailwindConfig,
} from "./workspace-discovery.js";

/** The constructed source-resolution pipeline. */
export interface SourcePipeline {
  readonly workspaceIndex: WorkspaceIndex;
  readonly registry: SourceRegistry;
  readonly adapterRegistry: AdapterRegistry;
  readonly resolver: SourceResolver;
}

/**
 * Structural shape every V1 integration adapter (next/vue/svelte/css-modules)
 * accepts. The resolver passes a richer {@link AdapterContext}; the
 * {@link wrapIntegration} bridge reshapes it into this minimal shape so the
 * integration packages' local mirrors (D15) stay decoupled from source-resolver
 * without tripping `exactOptionalPropertyTypes` contravariance on `resolve`.
 */
interface IntegrationAdapter {
  readonly id: string;
  readonly description?: string;
  resolve(context: {
    readonly cssClasses?: readonly string[];
    readonly runtimeInstanceCount?: number;
    readonly identity?: { readonly sourceId?: string; readonly fingerprint?: string };
  }): readonly SourceCandidate[];
}

/**
 * Bridge an integration adapter (local `SourceAdapterLike` contract) onto the
 * resolver's `SourceAdapter` contract. Builds a fresh context object so the
 * optional `identity.sourceId` is carried via conditional spread (never
 * `undefined`-valued), keeping the assignment `exactOptionalPropertyTypes`-clean.
 */
const wrapIntegration = (adapter: IntegrationAdapter): SourceAdapter => ({
  id: adapter.id,
  ...(adapter.description !== undefined ? { description: adapter.description } : {}),
  resolve: (ctx: AdapterContext): readonly SourceCandidate[] => {
    const identity = ctx.identity;
    return adapter.resolve({
      ...(ctx.cssClasses !== undefined ? { cssClasses: ctx.cssClasses } : {}),
      ...(ctx.runtimeInstanceCount !== undefined
        ? { runtimeInstanceCount: ctx.runtimeInstanceCount }
        : {}),
      identity: {
        fingerprint: identity.fingerprint,
        ...(identity.sourceId !== undefined ? { sourceId: identity.sourceId } : {}),
      },
    });
  },
});

/** Options for {@link buildSourcePipeline}. */
export interface BuildSourcePipelineOptions {
  readonly workspaceRoot: string;
  /** Marker entries loaded from storage to seed the in-memory registry. */
  readonly initialEntries?: readonly SourceEntry[];
  readonly logger: Logger;
}

/**
 * Build the full source-resolution pipeline: workspace index, in-memory marker
 * registry, V1 adapter registry (real-data factories only), and the resolver.
 *
 * Discovery is best-effort: missing Tailwind config / manifests / source maps
 * leave the corresponding adapter on its heuristic path. The resolver enforces
 * the never-wrong-HIGH policy on every candidate regardless of adapter input.
 */
export const buildSourcePipeline = async (
  opts: BuildSourcePipelineOptions,
): Promise<SourcePipeline> => {
  const workspaceIndex = await WorkspaceIndex.create(opts.workspaceRoot);

  const registry = new SourceRegistry();
  for (const entry of opts.initialEntries ?? []) registry.register(entry);

  const adapterRegistry = new AdapterRegistry();

  const tailwindConfig = await resolveTailwindConfig(opts.workspaceRoot);
  const sourceFiles = await discoverSourceFileContents(workspaceIndex.getAll());
  const cssManifest = await discoverCssModulesManifest(opts.workspaceRoot);
  const cssSourceMaps = await discoverCssSourceMaps(opts.workspaceRoot);

  // Real-data V1 adapter factories. The lookup closures bind to the in-memory
  // marker registry so Next/Vue/Svelte marker resolution shares the same
  // source-of-truth as the resolver's built-in marker cascade.
  const lookup = (sourceId: string): SourceEntry | undefined => registry.lookup(sourceId);

  adapterRegistry.register(
    createTailwindTokenAdapter({
      ...(tailwindConfig !== undefined ? { config: tailwindConfig } : {}),
      sourceFiles,
    }),
  );
  adapterRegistry.register(
    createCssModulesAdapter({
      ...(cssManifest !== undefined ? { manifest: cssManifest } : {}),
      ...(cssSourceMaps.size > 0 ? { sourceMaps: cssSourceMaps } : {}),
    }),
  );
  adapterRegistry.register(wrapIntegration(createNextAdapter({ lookup })));
  adapterRegistry.register(wrapIntegration(createVueAdapter({ lookup })));
  adapterRegistry.register(wrapIntegration(createSvelteAdapter({ lookup })));
  adapterRegistry.register(createCssInJsAdapter({}));

  opts.logger.info("Source pipeline built", {
    fileCount: workspaceIndex.fileCount,
    adapterCount: adapterRegistry.size,
    ...(tailwindConfig !== undefined ? { tailwind: true } : {}),
    ...(cssManifest !== undefined ? { cssModulesManifest: true } : {}),
    ...(cssSourceMaps.size > 0 ? { cssSourceMaps: cssSourceMaps.size } : {}),
  });

  const resolver = new SourceResolver({
    registry,
    cssTokenIndex: workspaceIndex.getCssTokens(),
    workspaceRoot: opts.workspaceRoot,
    adapters: adapterRegistry,
  });

  return { workspaceIndex, registry, adapterRegistry, resolver };
};

/** Protocol confidence values (one richer than the resolver's three). */
type ResolvedConfidence = "high" | "medium" | "low" | "none";

/** Outcome of one source-resolution request. */
export interface ResolvedSource {
  readonly sourceToken: string;
  readonly confidence: ResolvedConfidence;
}

/**
 * Resolve a §25.1 `source.request` (`elementId` only) to a {@link ResolvedSource}
 * ready for a §25.2.3 `source.resolved` reply.
 *
 * The `elementId` is treated as the opaque source marker id (MVP convention).
 * The stored entry's fingerprint is reused for the staleness comparison so a
 * registered marker resolves HIGH; an unknown id falls through the adapter
 * cascade to the LOW fallback. The resolver runs {@link enforceNeverWrongHigh}
 * on every candidate, so an adapter that lies never produces a false HIGH.
 */
export const resolveSourceRequest = (
  resolver: SourceResolver,
  registry: SourceRegistry,
  elementId: string,
): ResolvedSource => {
  const entry = registry.lookup(elementId);
  const identity: SelectionIdentity = {
    runtimeId: elementId,
    tagName: "div",
    frameId: "main",
    fingerprint: entry?.fingerprint ?? "",
    confidence: "high",
    ...(entry !== undefined ? { sourceId: elementId } : {}),
  };
  const candidate = resolver.resolve(identity);
  return {
    sourceToken: candidate.sourceId ?? elementId,
    confidence: candidate.confidence,
  };
};

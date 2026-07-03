/**
 * Svelte dev-only source marker preprocessor (VC-V1V2-19 / ADR-008).
 *
 * Injects opaque `data-vc-source` markers onto Svelte component markup in DEV
 * MODE ONLY via a Svelte `PreprocessorGroup`. The transform uses a lightweight
 * markup scanner ({@link scanMarkupElements}) to find element opening tags and
 * reuses the proven marker-injection primitives from @vision-control/vite-react.
 *
 * The opaque token is a truncated SHA-256 over (workspaceRelativePath, range,
 * fingerprint) — the same algorithm as vite-react/next-react/vue. It contains NO
 * file path.
 *
 * Two integration surfaces:
 * - {@link injectSvelteMarkers} — the pure transform (fully unit-testable).
 * - {@link visionControlSveltePreprocessor} — a Svelte `PreprocessorGroup`.
 *
 * **Supported (spike scope):** basic host elements (`<div>`, `<button>`), custom
 * components, and elements with static `class` attributes.
 *
 * **Unsupported (explicit diagnostics, never silent):** `<slot>`,
 * `<svelte:component>`, `<svelte:fragment>`, control blocks (`{#if}`, `{#each}`,
 * `{#await}`, `{#snippet}`), and dynamic class directives (`class:foo={cond}`).
 */

import {
  createSourceEntry,
  type SourceEntry,
  type SourceRegistry,
} from "@vision-control/source-registry";
import {
  computeElementFingerprint,
  computeWorkspaceRelativePath,
  generateSourceId,
  matchAny,
  normalizePath,
  SOURCE_MARKER_ATTRIBUTE,
} from "@vision-control/vite-react";
import MagicString from "magic-string";

import { type MarkupElement, scanMarkupElements } from "./markup-scanner.js";

export { SOURCE_MARKER_ATTRIBUTE } from "@vision-control/vite-react";

export interface SvelteMarkerOptions {
  readonly workspaceRoot?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  /** Explicit production kill-switch (belt-and-suspenders on NODE_ENV). */
  readonly production?: boolean;
  /** Registry to record marker -> source-location mappings. Default: fresh. */
  readonly registry?: SourceRegistry;
}

export interface SvelteMarkerTransformParams {
  readonly code: string;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface SvelteMarkerDiagnostic {
  readonly kind: string;
  readonly message: string;
  readonly line?: number;
}

export interface SvelteMarkerTransformResult {
  readonly code: string;
  readonly map: string;
  readonly entries: SourceEntry[];
  readonly diagnostics: SvelteMarkerDiagnostic[];
}

const DEFAULT_INCLUDE = ["**/*.svelte"];
const DEFAULT_EXCLUDE = ["node_modules/**", "dist/**"];

interface ExcludedRange {
  readonly start: number;
  readonly end: number;
}

const hasSvelteExtension = (posixPath: string): boolean => posixPath.endsWith(".svelte");

const stripQuery = (id: string): string => {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
};

/**
 * Find the char ranges of `<script>...</script>` and `<style>...</style>` blocks
 * so the scanner can skip them. Returns inclusive [start, end) ranges.
 */
const findExcludedBlocks = (code: string): ExcludedRange[] => {
  const ranges: ExcludedRange[] = [];
  const blockRe = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let match: RegExpExecArray | null = blockRe.exec(code);
  while (match !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    match = blockRe.exec(code);
  }
  return ranges;
};

/** Tags that are composition primitives, not addressable DOM elements. */
const UNSUPPORTED_TAGS = new Set(["slot", "svelte:component", "svelte:fragment"]);

/**
 * Detect unsupported Svelte constructs in the markup and return explicit
 * diagnostics. This is the misleading-success-output defense: probing an
 * unsupported feature produces a diagnostic, never a silent wrong result.
 */
export const detectSvelteUnsupported = (markup: string): SvelteMarkerDiagnostic[] => {
  const diagnostics: SvelteMarkerDiagnostic[] = [];
  const lines = markup.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;

    if (UNSUPPORTED_TAGS.has("slot") && /<slot[\s/>]/i.test(line)) {
      diagnostics.push({
        kind: "unsupported-tag",
        message: "<slot> is not yet supported by the Svelte source-marker adapter (spike scope)",
        line: i + 1,
      });
    }

    if (/<svelte:component\b/i.test(line)) {
      diagnostics.push({
        kind: "unsupported-dynamic-component",
        message:
          "<svelte:component this={...}> is not yet supported by the Svelte source-marker adapter (spike scope)",
        line: i + 1,
      });
    }

    if (/<svelte:fragment\b/i.test(line)) {
      diagnostics.push({
        kind: "unsupported-tag",
        message:
          "<svelte:fragment> is not yet supported by the Svelte source-marker adapter (spike scope)",
        line: i + 1,
      });
    }

    const controlBlockRe = /\{#(if|each|await|snippet|key)\b/;
    if (controlBlockRe.test(line)) {
      diagnostics.push({
        kind: "unsupported-control-block",
        message:
          "Svelte control blocks ({#if}/{#each}/{#await}/{#snippet}/{#key}) are not yet fully supported by the source-marker adapter (spike scope)",
        line: i + 1,
      });
    }
  }
  return diagnostics;
};

/**
 * The core dev-only transform: parse a `.svelte` component, inject opaque
 * `data-vc-source` markers on every markup element (excluding script/style
 * blocks), register the marker -> source-location mappings, and report
 * unsupported-construct diagnostics.
 *
 * Returns `undefined` when the file should NOT be transformed (wrong extension,
 * excluded by glob, or no elements).
 */
export const injectSvelteMarkers = (
  params: SvelteMarkerTransformParams,
): SvelteMarkerTransformResult | undefined => {
  const cleanId = stripQuery(params.filePath);
  const posixId = normalizePath(cleanId);
  if (!hasSvelteExtension(posixId)) return undefined;

  const posixRel = normalizePath(computeWorkspaceRelativePath(cleanId, params.workspaceRoot));

  if (matchAny(params.exclude, posixRel) || matchAny(params.exclude, posixId)) {
    return undefined;
  }
  if (!matchAny(params.include, posixRel) && !matchAny(params.include, posixId)) {
    return undefined;
  }

  const excludedBlocks = findExcludedBlocks(params.code);
  const diagnostics = detectSvelteUnsupported(params.code);

  const targets = scanMarkupElements(params.code, 0).filter((el) => {
    if (el.alreadyMarked) return false;
    // Skip elements inside <script> or <style> blocks.
    for (const range of excludedBlocks) {
      if (el.tagStart >= range.start && el.tagStart < range.end) return false;
    }
    return true;
  });

  if (targets.length === 0) {
    return { code: params.code, map: "", entries: [], diagnostics };
  }

  const ms = new MagicString(params.code);
  const fresh: SourceEntry[] = [];

  for (const element of targets) {
    const range = {
      startLine: element.startLine,
      startColumn: element.startColumn,
      endLine: element.endLine,
      endColumn: element.endColumn,
    };
    const fingerprint = computeElementFingerprint({
      componentName: element.tagName,
      staticClassName: element.staticClassName,
      staticText: undefined,
      source: element.source,
    });
    const sourceId = generateSourceId({ workspaceRelativePath: posixRel, range, fingerprint });

    ms.appendLeft(element.nameEnd, ` ${SOURCE_MARKER_ATTRIBUTE}="${sourceId}"`);

    fresh.push(
      createSourceEntry({
        sourceId,
        workspaceRelativePath: posixRel,
        range,
        componentName: element.tagName,
        ...(element.staticClassName !== undefined
          ? { staticClassName: element.staticClassName }
          : {}),
        fingerprint,
      }),
    );
  }

  return {
    code: ms.toString(),
    map: ms.generateMap({ source: posixRel, hires: true, includeContent: true }).toString(),
    entries: fresh,
    diagnostics,
  };
};

/**
 * Resolve whether the preprocessor is in production mode. SvelteKit/Vite sets
 * `NODE_ENV=production` during build. This is the authoritative "do not inject"
 * signal — there is no flag to enable markers in production (ADR-008 hard
 * guardrail).
 */
export const isSvelteProduction = (
  options?: Pick<SvelteMarkerOptions, "production">,
  env: NodeJS.ProcessEnv = process.env,
): boolean => options?.production === true || env.NODE_ENV === "production";

/** Minimal structural type for a Svelte PreprocessorGroup (no svelte dep). */
interface PreprocessorGroup {
  readonly name: string;
  readonly markup: (input: {
    readonly content: string;
    readonly filename?: string;
  }) =>
    | { readonly code: string; readonly map?: string }
    | Promise<{ readonly code: string; readonly map?: string }>;
}

/**
 * A Svelte `PreprocessorGroup` that injects dev-only source markers.
 *
 * In **production** (`vite build` / `NODE_ENV=production`): the markup function
 * returns the content unchanged (no marker, no `data-vc-source`).
 *
 * In **dev** (`vite dev`): applies {@link injectSvelteMarkers} to every
 * workspace `.svelte` file.
 */
export const visionControlSveltePreprocessor = (
  options: SvelteMarkerOptions = {},
): PreprocessorGroup => {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  return {
    name: "vision-control-svelte-source-markers",
    markup: (input: { readonly content: string; readonly filename?: string }) => {
      if (isSvelteProduction(options)) return { code: input.content };
      const filename = input.filename ?? "";
      const result = injectSvelteMarkers({
        code: input.content,
        filePath: filename,
        workspaceRoot,
        include,
        exclude,
      });
      if (result === undefined) return { code: input.content };
      return { code: result.code, map: result.map };
    },
  };
};

/**
 * Register a batch of marker entries into a registry (HMR-safe: clears the
 * file's stale entries first, then registers the fresh set).
 */
export const registerMarkerEntries = (
  registry: SourceRegistry,
  workspaceRelativePath: string,
  entries: readonly SourceEntry[],
): void => {
  registry.clearForFile(normalizePath(workspaceRelativePath));
  for (const entry of entries) registry.register(entry);
};

export type { MarkupElement };

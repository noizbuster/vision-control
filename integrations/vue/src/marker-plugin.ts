/**
 * Vue dev-only source marker plugin (VC-V1V2-19 / ADR-008).
 *
 * Injects opaque `data-vc-source` markers onto Vue SFC template elements in DEV
 * MODE ONLY. The transform uses a lightweight template scanner
 * ({@link scanTemplateElements}) to find element opening tags and reuses the
 * proven marker-injection primitives from @vision-control/vite-react
 * (generateSourceId, computeElementFingerprint, computeWorkspaceRelativePath).
 *
 * The opaque token is a truncated SHA-256 over (workspaceRelativePath, range,
 * fingerprint) — the same algorithm as vite-react/next-react. It contains NO
 * file path.
 *
 * Two integration surfaces:
 * - {@link injectVueMarkers} — the pure transform (fully unit-testable).
 * - {@link visionControlVueMarkerPlugin} — a Vite plugin that wires the
 *   transform into the dev pipeline.
 *
 * **Supported (spike scope):** basic host elements (`<div>`, `<button>`), custom
 * components (`<MyButton>`), and elements with static `class` attributes.
 *
 * **Unsupported (explicit diagnostics, never silent):** `<slot>`, dynamic
 * components (`<component :is>`), `<suspense>`, `<teleport>`, `<keep-alive>`,
 * `<transition>`, render functions (`h()`), and JSX. These are reported via
 * {@link detectVueUnsupported}.
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

import { scanTemplateElements, type TemplateElement } from "./template-scanner.js";

export { SOURCE_MARKER_ATTRIBUTE } from "@vision-control/vite-react";

export interface VueMarkerOptions {
  readonly workspaceRoot?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  /** Explicit production kill-switch (belt-and-suspenders on NODE_ENV). */
  readonly production?: boolean;
  /** Registry to record marker -> source-location mappings. Default: fresh. */
  readonly registry?: SourceRegistry;
}

export interface VueMarkerTransformParams {
  readonly code: string;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface VueMarkerDiagnostic {
  readonly kind: string;
  readonly message: string;
  readonly line?: number;
}

export interface VueMarkerTransformResult {
  readonly code: string;
  readonly map: string;
  readonly entries: SourceEntry[];
  readonly diagnostics: VueMarkerDiagnostic[];
}

const DEFAULT_INCLUDE = ["**/*.vue"];
const DEFAULT_EXCLUDE = ["node_modules/**", "dist/**"];

interface TemplateBlockInfo {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly content: string;
}

const hasVueExtension = (posixPath: string): boolean => posixPath.endsWith(".vue");

const stripQuery = (id: string): string => {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
};

/**
 * Extract the first `<template>...</template>` block content and its absolute
 * offsets within the SFC source. Returns undefined when no template block is
 * found (e.g. a render-function-only component or a `<script>` SFC).
 */
const extractTemplateBlock = (code: string): TemplateBlockInfo | undefined => {
  const openRe = /<template(\s[^>]*)?>/i;
  const openMatch = openRe.exec(code);
  if (openMatch === null) return undefined;
  const openTagEnd = openMatch.index + openMatch[0].length;
  const closeRe = /<\/template\s*>/i;
  const closeMatch = closeRe.exec(code.slice(openTagEnd));
  if (closeMatch === null) return undefined;
  const contentStart = openTagEnd;
  const contentEnd = openTagEnd + closeMatch.index;
  return {
    contentStart,
    contentEnd,
    content: code.slice(contentStart, contentEnd),
  };
};

/** Tags that are composition primitives, not addressable DOM elements. */
const UNSUPPORTED_TAGS = new Set([
  "slot",
  "component",
  "suspense",
  "teleport",
  "keep-alive",
  "transition",
  "transition-group",
]);

/**
 * Detect unsupported Vue constructs in the template content and return explicit
 * diagnostics. This is the misleading-success-output defense: probing an
 * unsupported feature produces a diagnostic, never a silent wrong result.
 */
export const detectVueUnsupported = (
  templateContent: string,
  blockLineOffset = 0,
): VueMarkerDiagnostic[] => {
  const diagnostics: VueMarkerDiagnostic[] = [];
  const lines = templateContent.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;

    for (const tag of UNSUPPORTED_TAGS) {
      const tagRe = new RegExp(`<${tag}[\\s/>]`, "i");
      if (tagRe.test(line)) {
        diagnostics.push({
          kind: "unsupported-tag",
          message: `<${tag}> is not yet supported by the Vue source-marker adapter (spike scope)`,
          line: i + 1 + blockLineOffset,
        });
      }
    }

    const dynamicComponentRe = /<component\s*:is/i;
    if (dynamicComponentRe.test(line)) {
      diagnostics.push({
        kind: "unsupported-dynamic-component",
        message:
          "dynamic component (<component :is>) is not yet supported by the Vue source-marker adapter (spike scope)",
        line: i + 1 + blockLineOffset,
      });
    }
  }
  return diagnostics;
};

/**
 * Compute the block's line offset so diagnostics reference file-relative lines.
 */
const blockLineOffset = (code: string, blockStart: number): number => {
  let count = 0;
  for (let i = 0; i < blockStart && i < code.length; i += 1) {
    if (code[i] === "\n") count += 1;
  }
  return count;
};

/**
 * The core dev-only transform: parse a `.vue` SFC, inject opaque
 * `data-vc-source` markers on every template element, register the marker ->
 * source-location mappings, and report unsupported-construct diagnostics.
 *
 * Returns `undefined` when the file should NOT be transformed (wrong extension,
 * excluded by glob, no template block, or no elements).
 */
export const injectVueMarkers = (
  params: VueMarkerTransformParams,
): VueMarkerTransformResult | undefined => {
  const cleanId = stripQuery(params.filePath);
  const posixId = normalizePath(cleanId);
  if (!hasVueExtension(posixId)) return undefined;

  const posixRel = normalizePath(computeWorkspaceRelativePath(cleanId, params.workspaceRoot));

  if (matchAny(params.exclude, posixRel) || matchAny(params.exclude, posixId)) {
    return undefined;
  }
  if (!matchAny(params.include, posixRel) && !matchAny(params.include, posixId)) {
    return undefined;
  }

  const block = extractTemplateBlock(params.code);
  if (block === undefined) {
    return {
      code: params.code,
      map: "",
      entries: [],
      diagnostics: [
        {
          kind: "no-template",
          message:
            "SFC has no <template> block (render-function or script-only component); not yet supported",
        },
      ],
    };
  }

  const lineOffset = blockLineOffset(params.code, block.contentStart);
  const diagnostics = detectVueUnsupported(block.content, lineOffset);

  const targets = scanTemplateElements(block.content, block.contentStart).filter(
    (el) => !el.alreadyMarked,
  );
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
 * Resolve whether the plugin is in production mode. The Vite `build` command
 * sets `NODE_ENV=production`. This is the authoritative "do not inject" signal —
 * there is no flag to enable markers in production (ADR-008 hard guardrail).
 */
export const isVueProduction = (
  options?: Pick<VueMarkerOptions, "production">,
  env: NodeJS.ProcessEnv = process.env,
): boolean => options?.production === true || env.NODE_ENV === "production";

/**
 * A Vite plugin that injects dev-only source markers into Vue SFC templates.
 *
 * In **production** (`vite build` / `NODE_ENV=production`): the transform
 * returns null (no code modification, no marker, no `data-vc-source` anywhere).
 *
 * In **dev** (`vite dev` / `vite serve`): applies {@link injectVueMarkers} to
 * every workspace `.vue` file.
 */
export const visionControlVueMarkerPlugin = (
  options: VueMarkerOptions = {},
): {
  readonly name: string;
  readonly enforce: "pre";
  readonly apply: "serve";
  readonly transform: (code: string, id: string) => { code: string; map: string } | null;
} => {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  return {
    name: "vision-control:vue-source-markers",
    enforce: "pre",
    apply: "serve",
    transform: (code: string, id: string): { code: string; map: string } | null => {
      if (isVueProduction(options)) return null;
      const result = injectVueMarkers({ code, filePath: id, workspaceRoot, include, exclude });
      if (result === undefined) return null;
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

export type { TemplateElement };

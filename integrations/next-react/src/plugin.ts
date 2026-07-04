/**
 * Next.js dev-only source marker plugin (VC-V1V2-13 / ADR-008).
 *
 * Injects opaque `data-vc-source` markers onto Next.js JSX/TSX elements in DEV
 * MODE ONLY. The transform reuses the proven marker-injection primitives from
 * @vision-control/vite-react (parseJsx, findJsxElements, generateSourceId) and
 * adds Next.js-specific concerns:
 *
 * 1. **Server/client boundary detection** — scans for `"use client"` /
 *    `"use server"` directives and records boundary metadata.
 * 2. **Route-segment detection** — infers the route segment from the file path
 *    (app router `page.tsx` / `layout.tsx`, pages router nested .tsx).
 * 3. **Production gate** — `next build` sets `NODE_ENV=production`; the wrapper
 *    returns the config UNCHANGED so NO transform runs and NO marker ships.
 *
 * The opaque token is a truncated SHA-256 over (workspaceRelativePath, range,
 * fingerprint) — the same algorithm as vite-react. It contains NO file path.
 *
 * Two integration surfaces:
 * - {@link injectNextMarkers} — the pure transform (fully unit-testable).
 * - {@link withVisionControlSourceMarkers} — a Next.js config wrapper that wires
 *   the transform into the webpack dev pipeline.
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
  parseJsx,
  SOURCE_MARKER_ATTRIBUTE,
} from "@vision-control/vite-react";
import MagicString from "magic-string";

import { findJsxElements } from "./find-jsx-elements.js";
import type { RouteSegmentInfo, ServerClientBoundary } from "./types.js";

export { SOURCE_MARKER_ATTRIBUTE } from "@vision-control/vite-react";

const loaderPath = new URL("./loader.js", import.meta.url).pathname;

export interface NextSourceMarkerOptions {
  readonly workspaceRoot?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  /** Explicit production kill-switch (belt-and-suspenders on NODE_ENV). */
  readonly production?: boolean;
  /** Registry to record marker -> source-location mappings. Default: fresh. */
  readonly registry?: SourceRegistry;
}

export interface NextMarkerTransformParams {
  readonly code: string;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface NextMarkerTransformResult {
  readonly code: string;
  readonly map: string;
  readonly entries: SourceEntry[];
  readonly boundaries: ServerClientBoundary[];
  readonly routeSegment: RouteSegmentInfo | undefined;
}

const DEFAULT_INCLUDE = ["**/*.{jsx,tsx}"];
const DEFAULT_EXCLUDE = ["node_modules/**", ".next/**"];

const hasJsxExtension = (posixPath: string): boolean =>
  posixPath.endsWith(".jsx") || posixPath.endsWith(".tsx");

const stripQuery = (id: string): string => {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
};

const safeParse = (code: string): ReturnType<typeof parseJsx> | undefined => {
  try {
    return parseJsx(code);
  } catch {
    return undefined;
  }
};

/**
 * Detect `"use client"` / `"use server"` directives at the top of a module.
 * Returns one boundary entry per directive found (typically zero or one).
 * Uses a line-by-line scan (not AST) because directives are source-level
 * string literals that Babel may represent differently across versions.
 */
export const detectBoundaries = (
  code: string,
  workspaceRelativePath: string,
): ServerClientBoundary[] => {
  const boundaries: ServerClientBoundary[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length && i < 5; i += 1) {
    const line = lines[i];
    if (line === undefined) break;
    const trimmed = line.trim();
    const useClientMatch = /^["']use client["']/.exec(trimmed);
    if (useClientMatch !== null) {
      boundaries.push({
        workspaceRelativePath,
        directive: "use client",
        line: i + 1,
        column: line.indexOf(trimmed),
      });
      continue;
    }
    const useServerMatch = /^["']use server["']/.exec(trimmed);
    if (useServerMatch !== null) {
      boundaries.push({
        workspaceRelativePath,
        directive: "use server",
        line: i + 1,
        column: line.indexOf(trimmed),
      });
    }
    if (trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*")) {
      if (boundaries.length === 0) break;
    }
  }
  return boundaries;
};

/**
 * Infer the route segment from a Next.js file path.
 *
 * App router: `app/page.tsx` -> segment "page"; `app/blog/[slug]/page.tsx` ->
 * "blog/[slug]/page"; `app/layout.tsx` -> "layout".
 * Pages router: `pages/index.tsx` -> segment "index"; `pages/about.tsx` ->
 * "about"; `pages/blog/[slug].tsx` -> "blog/[slug]".
 */
export const detectRouteSegment = (workspaceRelativePath: string): RouteSegmentInfo | undefined => {
  const posix = normalizePath(workspaceRelativePath);

  const appMatch = /^app\/(.+)$/.exec(posix);
  if (appMatch !== null) {
    const rest = appMatch[1];
    if (rest === undefined) return undefined;
    const baseName = rest.split("/").pop() ?? rest;
    const withoutExt = baseName.replace(/\.(jsx|tsx|ts|js)$/, "");
    return {
      workspaceRelativePath,
      segment: withoutExt,
      routerType: "app",
      fileName: baseName,
    };
  }

  const pagesMatch = /^pages\/(.+)$/.exec(posix);
  if (pagesMatch !== null) {
    const rest = pagesMatch[1];
    if (rest === undefined) return undefined;
    const baseName = rest.split("/").pop() ?? rest;
    const withoutExt = baseName.replace(/\.(jsx|tsx|ts|js)$/, "");
    return {
      workspaceRelativePath,
      segment: withoutExt,
      routerType: "pages",
      fileName: baseName,
    };
  }

  return undefined;
};

/**
 * The core dev-only transform: parse a JSX/TSX module, inject opaque
 * `data-vc-source` markers on every JSX element, and register the marker ->
 * source-location mappings. Returns the transformed code, source map, registry
 * entries, boundary metadata, and route segment.
 *
 * Returns `undefined` when the file should NOT be transformed (wrong extension,
 * excluded by glob, no JSX elements, or parse failure).
 */
export const injectNextMarkers = (
  params: NextMarkerTransformParams,
): NextMarkerTransformResult | undefined => {
  const cleanId = stripQuery(params.filePath);
  const posixId = normalizePath(cleanId);
  if (!hasJsxExtension(posixId)) return undefined;

  const posixRel = normalizePath(computeWorkspaceRelativePath(cleanId, params.workspaceRoot));

  if (matchAny(params.exclude, posixRel) || matchAny(params.exclude, posixId)) {
    return undefined;
  }
  if (!matchAny(params.include, posixRel) && !matchAny(params.include, posixId)) {
    return undefined;
  }

  const ast = safeParse(params.code);
  if (ast === undefined) return undefined;

  const targets = findJsxElements(ast, params.code).filter((el) => !el.alreadyMarked);
  if (targets.length === 0) {
    return {
      code: params.code,
      map: "",
      entries: [],
      boundaries: detectBoundaries(params.code, posixRel),
      routeSegment: detectRouteSegment(posixRel),
    };
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
      componentName: element.componentName,
      staticClassName: element.staticClassName,
      staticText: element.staticText,
      source: element.source,
    });
    const sourceId = generateSourceId({ workspaceRelativePath: posixRel, range, fingerprint });

    ms.appendLeft(element.nameEnd, ` ${SOURCE_MARKER_ATTRIBUTE}="${sourceId}"`);

    fresh.push(
      createSourceEntry({
        sourceId,
        workspaceRelativePath: posixRel,
        range,
        componentName: element.componentName,
        ...(element.staticClassName !== undefined
          ? { staticClassName: element.staticClassName }
          : {}),
        ...(element.staticText !== undefined ? { staticText: element.staticText } : {}),
        fingerprint,
      }),
    );
  }

  return {
    code: ms.toString(),
    map: ms.generateMap({ source: posixRel, hires: true, includeContent: true }).toString(),
    entries: fresh,
    boundaries: detectBoundaries(params.code, posixRel),
    routeSegment: detectRouteSegment(posixRel),
  };
};

/**
 * Resolve whether the plugin is in production mode. Next.js sets
 * `NODE_ENV=production` during `next build`. This is the authoritative
 * "do not inject" signal — there is no flag to enable markers in production
 * (ADR-008 hard guardrail).
 */
export const isNextProduction = (
  options?: Pick<NextSourceMarkerOptions, "production">,
  env: NodeJS.ProcessEnv = process.env,
): boolean => options?.production === true || env.NODE_ENV === "production";

/**
 * Next.js config object (minimal structural type — enough to wrap without
 * importing `next`). The wrapper preserves all user fields and only adds the
 * marker transform to the webpack dev pipeline.
 */
export type NextConfig = Record<string, unknown> & {
  readonly webpack?: (
    config: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => Record<string, unknown>;
};

type WebpackConfig = {
  readonly module?: {
    readonly rules?: unknown[];
  };
};

type WebpackContext = {
  readonly dev?: boolean;
  readonly isServer?: boolean;
};

/**
 * A Next.js config wrapper. Usage in `next.config.js`:
 *
 * ```js
 * const { withVisionControlSourceMarkers } = require("@vision-control/next-react");
 * module.exports = withVisionControlSourceMarkers();
 * ```
 *
 * In **production** (`next build`): returns the config UNCHANGED. No webpack
 * modification, no marker transform, no `data-vc-source` anywhere in the output.
 *
 * In **dev** (`next dev`): wraps the user's `webpack` function to add a module
 * rule that applies {@link injectNextMarkers} to workspace `.jsx`/`.tsx` files.
 */
export const withVisionControlSourceMarkers = (
  nextConfig: NextConfig = {},
  options: NextSourceMarkerOptions = {},
): NextConfig => {
  if (isNextProduction(options)) return nextConfig;

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  const userWebpack = nextConfig.webpack;

  return {
    ...nextConfig,
    webpack: (config: WebpackConfig, context: WebpackContext): WebpackConfig => {
      const afterUser: WebpackConfig =
        typeof userWebpack === "function"
          ? (userWebpack(
              config as Record<string, unknown>,
              context as Record<string, unknown>,
            ) as WebpackConfig)
          : config;

      if (context.dev === false) return afterUser;

      const rules = Array.isArray(afterUser.module?.rules)
        ? [...(afterUser.module?.rules ?? [])]
        : [];
      rules.push({
        test: /node_modules[/\\]@babel[/\\](?:traverse|parser|types)[/\\]/,
        type: "commonjs" as const,
      });
      rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre" as const,
        use: [
          {
            loader: loaderPath,
            options: { workspaceRoot, include, exclude },
          },
        ],
      });

      return {
        ...afterUser,
        module: { ...afterUser.module, rules },
      };
    },
  };
};

/**
 * Register a batch of marker entries into a registry (HMR-safe: clears the
 * file's stale entries first, then registers the fresh set). This is the
 * Next.js analogue of vite-react's `registry.clearForFile` + `register` cycle.
 */
export const registerMarkerEntries = (
  registry: SourceRegistry,
  workspaceRelativePath: string,
  entries: readonly SourceEntry[],
): void => {
  registry.clearForFile(normalizePath(workspaceRelativePath));
  for (const entry of entries) registry.register(entry);
};

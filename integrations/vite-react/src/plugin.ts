import {
  createSourceEntry,
  type SourceEntry,
  SourceRegistry,
} from "@vision-control/source-registry";
import MagicString from "magic-string";
import type { Plugin } from "vite";

import { findJsxElements, parseJsx } from "./babel-helpers.js";
import {
  resolveProduction,
  SOURCE_MARKER_ATTRIBUTE,
  type SourceMarkerConfig,
  SourceMarkerConfigSchema,
} from "./config.js";
import { matchAny, normalizePath } from "./match.js";
import {
  computeElementFingerprint,
  computeWorkspaceRelativePath,
  generateSourceId,
} from "./source-id.js";

/**
 * Vite plugin that injects dev-only opaque source markers into host JSX/TSX
 * (PRD 14.3).
 *
 * For every JSX opening element in a workspace `.jsx`/`.tsx` file it inserts
 * `data-vc-source="<opaque-id>"` via MagicString (source-map preserving) and
 * registers the id -> workspace-relative-location mapping in a
 * {@link SourceRegistry}. Two hard guarantees:
 *
 * 1. DEV-ONLY. A production build (`command === "build"`) OR an explicit
 *    `production` flag short-circuits the transform and returns the code
 *    UNCHANGED. No marker ever ships to a production bundle (PRD guardrail,
 *    ADR-008).
 * 2. NO ABSOLUTE PATHS. The id is an opaque SHA-256 token; only the
 *    workspace-relative path is stored, and the registry independently rejects
 *    anything path-like.
 */
export interface SourceMarkerPluginOptions extends Partial<SourceMarkerConfig> {
  /** Inject a shared registry (e.g. for tests / daemon sync). Default: a fresh one. */
  readonly registry?: SourceRegistry;
}

const stripQuery = (id: string): string => {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
};

const hasJsxExtension = (posixPath: string): boolean =>
  posixPath.endsWith(".jsx") || posixPath.endsWith(".tsx");

const safeParse = (code: string): ReturnType<typeof parseJsx> | undefined => {
  try {
    return parseJsx(code);
  } catch {
    return undefined;
  }
};

export const visionControlSourceMarkerPlugin = (options?: SourceMarkerPluginOptions): Plugin => {
  const registry: SourceRegistry = options?.registry ?? new SourceRegistry();
  const config = SourceMarkerConfigSchema.parse(options ?? {});

  let command: "build" | "serve" = "serve";
  let workspaceRoot = config.workspaceRoot ?? process.cwd();

  return {
    name: "vision-control-source-marker",
    enforce: "pre",

    config(_userConfig, env) {
      command = env.command;
    },

    configResolved(resolved) {
      if (config.workspaceRoot === undefined) workspaceRoot = resolved.root;
    },

    transform(code, id) {
      if (resolveProduction(config, command)) return undefined;

      const cleanId = stripQuery(id);
      const posixId = normalizePath(cleanId);
      if (!hasJsxExtension(posixId)) return undefined;

      const posixRel = normalizePath(computeWorkspaceRelativePath(cleanId, workspaceRoot));

      // Exclude beats include; both are tried against the relative and
      // absolute path so a `node_modules/**` exclude fires at any depth.
      if (matchAny(config.exclude, posixRel) || matchAny(config.exclude, posixId)) {
        return undefined;
      }
      if (!matchAny(config.include, posixRel) && !matchAny(config.include, posixId)) {
        return undefined;
      }

      const ast = safeParse(code);
      if (ast === undefined) return undefined;

      const targets = findJsxElements(ast, code).filter((element) => !element.alreadyMarked);
      if (targets.length === 0) return undefined;

      const ms = new MagicString(code);
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

      // HMR-safe: drop this file's stale entries, then register the fresh set.
      registry.clearForFile(posixRel);
      for (const entry of fresh) registry.register(entry);

      return {
        code: ms.toString(),
        map: ms.generateMap({ source: posixRel, hires: true, includeContent: true }),
      };
    },

    handleHotUpdate(ctx) {
      if (resolveProduction(config, command)) return;
      const posixRel = normalizePath(
        computeWorkspaceRelativePath(stripQuery(ctx.file), workspaceRoot),
      );
      if (hasJsxExtension(posixRel)) registry.clearForFile(posixRel);
      // Returning nothing lets Vite run default HMR; the transform hook
      // re-registers the fresh entries on the next pass.
      return;
    },
  };
};

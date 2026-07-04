/**
 * Workspace data discovery for the V1 source-resolution pipeline (PRD §15 / §24.1).
 *
 * Best-effort, never-throwing discovery of the build-tool data the V1 adapter
 * factories need: a parsed Tailwind v3 config, the workspace's source-file
 * contents (for AST-origin scans), CSS Modules bundler manifests, and CSS source
 * maps. When a data source is absent the corresponding adapter receives empty
 * data and falls back to its heuristic path (never a false HIGH — the
 * never-wrong-HIGH policy is enforced downstream by the resolver).
 *
 * Platform: node. Reads `node:fs` / `node:path` and dynamic-imports config files.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TailwindConfigInput } from "@vision-control/tailwind";
import type { FileEntry } from "@vision-control/workspace-index";

/** Read a file as UTF-8; return undefined when missing or unreadable. */
const readText = async (absPath: string): Promise<string | undefined> => {
  try {
    return await readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
};

const TAILWIND_CONFIG_NAMES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
];

/**
 * Resolve and parse a Tailwind v3 config from the workspace root. Returns
 * `undefined` when no config file is present (the adapter then uses the built-in
 * default scale). The dynamic `import()` honors Node's native type stripping for
 * `.ts`; a thrown import degrades to `undefined` (malformed config → defaults).
 *
 * The returned `configPath` is the workspace-relative filename of the resolved
 * config (e.g. `"tailwind.config.ts"`), used for token provenance. It is always
 * workspace-relative — never absolute — matching the {@link SourceCandidate}
 * path invariant.
 */
export interface ResolvedTailwindConfig {
  readonly config: TailwindConfigInput;
  readonly configPath: string;
}

export const resolveTailwindConfig = async (
  workspaceRoot: string,
): Promise<ResolvedTailwindConfig | undefined> => {
  for (const name of TAILWIND_CONFIG_NAMES) {
    const absPath = join(workspaceRoot, name);
    const exists = await stat(absPath)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!exists) continue;
    try {
      const mod = (await import(`${absPath}`)) as { default?: unknown };
      if (mod.default !== undefined && typeof mod.default === "object") {
        return { config: mod.default as TailwindConfigInput, configPath: name };
      }
    } catch {
      // Malformed or uncompilable config; fall through to the next candidate.
    }
  }
  return undefined;
};

/**
 * Extract the workspace Tailwind breakpoint scale (`screens`) as an ordered
 * list of names. Reads `theme.screens` (modern) then the legacy top-level
 * `screens` key. Returns `undefined` when no config is resolved or it carries
 * no screens — the content runtime then falls back to its hardcoded default
 * scale. Only the NAMES are delivered; the content runtime maps them to pixel
 * widths (it MUST NOT import this node-only package).
 */
export const discoverTailwindScreens = async (
  workspaceRoot: string,
): Promise<readonly string[] | undefined> => {
  const resolved = await resolveTailwindConfig(workspaceRoot);
  if (resolved === undefined) return undefined;
  const themeScreens = resolved.config.theme?.screens;
  const source = themeScreens ?? resolved.config.screens;
  if (source === undefined) return undefined;
  const names = Object.keys(source);
  return names.length > 0 ? names : undefined;
};

/**
 * Build a `relPath -> content` map over the indexed source files. Used by the
 * Tailwind adapter's AST-origin scan. Reads only files the workspace index
 * already discovered; never walks the tree itself.
 */
export const discoverSourceFileContents = async (
  entries: readonly FileEntry[],
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  for (const entry of entries) {
    const content = await readText(entry.absolutePath);
    if (content !== undefined) out.set(entry.workspaceRelativePath, content);
  }
  return out;
};

const JSON_SUFFIX_RE = /\.json$/i;

/**
 * Recursively find JSON files under `dirRoot` whose name matches `nameTest`.
 * Returns absolute paths. Used to locate css-modules manifests and `.css.map`
 * source maps emitted alongside the bundle output.
 */
const findJsonFiles = async (
  dirRoot: string,
  nameTest: (name: string) => boolean,
): Promise<string[]> => {
  const results: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && JSON_SUFFIX_RE.test(entry.name) && nameTest(entry.name)) {
        results.push(full);
      }
    }
  };
  await walk(dirRoot);
  return results;
};

const MANIFEST_NAME_RE = /\.modules?\.(css|scss|sass)\.json$|^manifest\.(json|css-modules\.json)$/i;

/**
 * Discover CSS Modules bundler manifests under the workspace root. Parses each
 * via `parseManifestJson` and merges all entries into one combined manifest. The
 * css-modules adapter consumes the merged manifest for hashed-class resolution.
 *
 * Returns `undefined` when no manifest files are found (the adapter then falls
 * back to hash-name heuristics — never HIGH).
 */
export const discoverCssModulesManifest = async (
  workspaceRoot: string,
): Promise<import("@vision-control/css-modules").CssModulesManifest | undefined> => {
  const { parseManifestJson, CssModulesManifest } = await import("@vision-control/css-modules");
  const files = await findJsonFiles(workspaceRoot, (name) => MANIFEST_NAME_RE.test(name));
  if (files.length === 0) return undefined;
  const merged: import("@vision-control/css-modules").ManifestEntry[] = [];
  let format: import("@vision-control/css-modules").ManifestFormat = "unknown";
  for (const absPath of files) {
    const text = await readText(absPath);
    if (text === undefined) continue;
    const parsed = parseManifestJson(text);
    merged.push(...parsed.entries);
    if (format === "unknown" && parsed.format !== "unknown") format = parsed.format;
  }
  return merged.length === 0 ? undefined : new CssModulesManifest(merged, format);
};

/**
 * Discover CSS source-map (`.css.map`) files under the workspace root. Parses
 * each via `parseSourceMap` and indexes by the map's `file` name (falling back
 * to the `.css` sibling). The css-modules adapter consumes the map for
 * class-declaration range resolution (HIGH via `source-map` + range).
 *
 * Returns an empty map when no source maps are found.
 */
export const discoverCssSourceMaps = async (
  workspaceRoot: string,
): Promise<Map<string, import("@vision-control/css-modules").CssSourceMap>> => {
  const { parseSourceMap } = await import("@vision-control/css-modules");
  const out = new Map<string, import("@vision-control/css-modules").CssSourceMap>();
  const files = await findJsonFiles(workspaceRoot, (name) => name.endsWith(".css.map"));
  for (const absPath of files) {
    const text = await readText(absPath);
    if (text === undefined) continue;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      continue;
    }
    const map = parseSourceMap(parsedJson);
    if (map === undefined) continue;
    const key = absPath.replace(/\.map$/i, "");
    out.set(key, map);
  }
  return out;
};

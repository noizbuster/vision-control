/**
 * Normalize source-map `sources` entries into agent-facing relative paths.
 *
 * Strips bundler virtual schemes (`webpack://`, `webpack-internal://`, …) and
 * common project-prefix noise so agents can match workspace files. Never
 * produces a machine-absolute path requirement.
 */

/** Schemes that wrap module paths in common bundler maps. */
const VIRTUAL_SCHEMES = [
  "webpack-internal:///",
  "webpack-internal://",
  "webpack:///",
  "webpack://",
  "ng:///",
  "ng://",
  "metro:///",
  "metro://",
  "turbopack:///",
  "turbopack://",
  "file:///",
  "file://",
] as const;

/**
 * Normalize a single map `sources` entry.
 *
 * Returns `undefined` when the path is empty or pure bundler runtime noise
 * (not a useful module candidate).
 */
export const normalizeMapSourcePath = (raw: string): string | undefined => {
  let path = raw.trim();
  if (path.length === 0) return undefined;

  for (const scheme of VIRTUAL_SCHEMES) {
    if (path.startsWith(scheme)) {
      path = path.slice(scheme.length);
      break;
    }
  }

  path = path.replace(/\\/g, "/");
  // Drop query/hash fragments sometimes appended by loaders.
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);

  // webpack://project-name/./src/App.tsx → src/App.tsx
  const projectDot = path.match(/^[^/]+\/\.\/(.+)$/);
  if (projectDot?.[1] !== undefined) {
    path = projectDot[1];
  }

  // Leading ./ after scheme strip.
  while (path.startsWith("./")) {
    path = path.slice(2);
  }

  // Single leading slash that is project-root relative (not OS absolute).
  // Keep Windows drive and POSIX home/usr absolute paths as-is for agents.
  if (path.startsWith("/") && !isOsAbsolutePath(path)) {
    path = path.slice(1);
  }

  path = path.trim();
  if (path.length === 0) return undefined;
  if (isBundlerRuntimeNoise(path)) return undefined;
  return path;
};

/**
 * Whether a normalized path is webpack/vite runtime scaffolding rather than
 * application source.
 */
export const isBundlerRuntimeNoise = (path: string): boolean => {
  const lower = path.toLowerCase();
  if (lower.startsWith("(webpack)")) return true;
  if (lower.startsWith("webpack/bootstrap")) return true;
  if (lower.startsWith("webpack/runtime")) return true;
  if (lower.startsWith("webpack/sharing")) return true;
  if (lower.startsWith("webpack/container")) return true;
  if (lower === "webpack/bootstrap") return true;
  // Vite client / HMR plumbing
  if (lower.includes("/@vite/") || lower.startsWith("@vite/")) return true;
  if (lower.includes("vite/dist/client")) return true;
  return false;
};

const isOsAbsolutePath = (path: string): boolean => {
  // POSIX absolute under common roots, or Windows drive.
  if (/^\/(Users|home|usr|var|tmp|opt|etc)\//i.test(path)) return true;
  if (/^[a-zA-Z]:\//.test(path)) return true;
  return false;
};

/**
 * Join source-map `sourceRoot` with a `sources` entry (source-map v3).
 * Absolute URL sources are returned unchanged.
 */
export const joinSourceRoot = (sourceRoot: string, source: string): string => {
  if (sourceRoot.length === 0) return source;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) return source;
  if (source.startsWith("/")) return source;
  const base = sourceRoot.endsWith("/") ? sourceRoot : `${sourceRoot}/`;
  return `${base}${source}`;
};

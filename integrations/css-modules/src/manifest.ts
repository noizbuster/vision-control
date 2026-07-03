/**
 * CSS Modules manifest loading and parsing (VC-V1V2-12).
 *
 * A CSS Modules manifest is the bundler-generated JSON that maps a CSS Module's
 * LOCAL class names to their RUNTIME hashed names. Different bundlers emit
 * slightly different shapes:
 *
 * - **css-loader** (webpack / Next.js / Turbopack): keyed by module path, each
 *   value is `{ localName: "hashedName" }`. When a class uses `composes`, the
 *   hashed value is a space-separated string of all composed hashes:
 *   `{ "button": "_base_1a2b _button_3c4d" }`.
 * - **Vite**: same logical shape (module-path keyed, local→hashed) but with
 *   Vite's naming convention `_${localName}_${hash}`.
 *
 * This module parses either format, detects which one it saw, and builds a
 * reverse lookup (hashed name → manifest entries) so the adapter can resolve a
 * runtime hashed class back to its local name and module path.
 */

export type ManifestFormat = "css-loader" | "vite" | "unknown";

/** One entry in a parsed CSS Modules manifest. */
export interface ManifestEntry {
  /** Workspace-relative module path, e.g. `"src/Button.module.css"`. */
  readonly modulePath: string;
  /** Local class name in the module source, e.g. `"button"`. */
  readonly localName: string;
  /** Primary hashed name, e.g. `"_button_ab12cd"`. */
  readonly hashedName: string;
  /**
   * All hashed names emitted for this local name. Length > 1 when the class
   * uses `composes` (the value in the manifest JSON is space-separated).
   */
  readonly composedHashes: readonly string[];
}

/**
 * Parsed CSS Modules manifest with a reverse-lookup index by hashed name.
 */
export class CssModulesManifest {
  private readonly byHash: Map<string, ManifestEntry[]>;

  constructor(
    readonly entries: readonly ManifestEntry[],
    readonly format: ManifestFormat,
  ) {
    this.byHash = new Map();
    for (const entry of entries) {
      const hashes = entry.composedHashes.length > 0 ? entry.composedHashes : [entry.hashedName];
      for (const hash of hashes) {
        const existing = this.byHash.get(hash);
        if (existing !== undefined) {
          existing.push(entry);
        } else {
          this.byHash.set(hash, [entry]);
        }
      }
    }
  }

  /** Reverse-lookup: find all manifest entries that produce the given hashed name. */
  lookupByHash(hashedName: string): readonly ManifestEntry[] {
    return this.byHash.get(hashedName) ?? [];
  }

  /** Whether the manifest contains any entries. */
  get isEmpty(): boolean {
    return this.entries.length === 0;
  }
}

const CSS_MODULE_PATH_RE = /\.(module\.)?(css|scss|sass|less|styl)$/;

/**
 * Parse a raw manifest JSON value (already `JSON.parse`d or loaded as an
 * object) into a {@link CssModulesManifest}.
 *
 * Accepts the css-loader / Vite shape `{ modulePath: { localName: "hashed" } }`.
 * Malformed input (non-object, missing values, wrong types) degrades gracefully
 * to an empty manifest with format `"unknown"` — the caller then falls back to
 * hash heuristics. This is the `malformed input` adversarial defense.
 */
export const parseManifest = (input: unknown): CssModulesManifest => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return new CssModulesManifest([], "unknown");
  }

  const entries: ManifestEntry[] = [];
  let format: ManifestFormat = "unknown";

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;

    if (CSS_MODULE_PATH_RE.test(key)) {
      if (format === "unknown") format = "css-loader";
    }

    for (const [localName, hashedValue] of Object.entries(value as Record<string, unknown>)) {
      if (typeof hashedValue !== "string" || hashedValue.length === 0) continue;
      const hashes = hashedValue.split(/\s+/).filter((h) => h.length > 0);
      if (hashes.length === 0) continue;
      entries.push({
        modulePath: key,
        localName,
        hashedName: hashes[0] ?? hashedValue,
        composedHashes: hashes,
      });
    }
  }

  if (entries.length > 0 && format === "unknown") {
    format = "css-loader";
  }

  return new CssModulesManifest(entries, format);
};

/**
 * Load and parse a manifest from a JSON string. Returns an empty manifest on
 * parse failure (malformed JSON).
 */
export const parseManifestJson = (json: string): CssModulesManifest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return new CssModulesManifest([], "unknown");
  }
  return parseManifest(parsed);
};

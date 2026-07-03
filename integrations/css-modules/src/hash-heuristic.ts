/**
 * Conservative CSS Modules hash-name detector (VC-V1V2-12).
 *
 * This is a LAST-RESORT heuristic. When no manifest or source map is available,
 * the adapter inspects the runtime class name for patterns that LOOK like CSS
 * Modules hashed output. It returns MEDIUM or LOW confidence — NEVER HIGH.
 *
 * Recognized patterns:
 * - `_[local]_[hash]` (css-loader / Vite underscore convention)
 * - `[File]_[local]__[hash]` (css-loader namespaced convention)
 *
 * A plain class like `btn` or `button-large` does NOT match and returns
 * `{ matched: false }`. This prevents false positives on hand-written CSS.
 */

export type HashPattern =
  | "css-loader-underscore"
  | "css-loader-namespaced"
  | "vite-underscore"
  | "unknown";

/** The minimum hash suffix length we accept (filters out short false positives). */
const MIN_HASH_LENGTH = 4;
/** The maximum hash suffix length (common css-loader base64:5 / Vite longer). */
const MAX_HASH_LENGTH = 16;

export interface HashHeuristicResult {
  readonly matched: boolean;
  readonly confidence: "medium" | "low";
  readonly localNameGuess?: string;
  readonly pattern: HashPattern;
}

const HASH_CHARS = `[a-zA-Z0-9_-]{${MIN_HASH_LENGTH},${MAX_HASH_LENGTH}}`;
const LOCAL_CHARS = "[a-zA-Z][\\w-]*";

/**
 * Detect whether a runtime class name looks like a CSS Modules hashed name.
 * Returns `{ matched: true, confidence: "medium" }` for strong patterns and
 * `confidence: "low"` for weaker ones. NEVER returns HIGH.
 */
export const detectHashHeuristic = (className: string): HashHeuristicResult => {
  // Pattern: [File]_[local]__[hash] — css-loader namespaced.
  // Example: Button_root__1a2b3c
  const namespaced = className.match(
    new RegExp(`^[A-Za-z][\\w-]*_${LOCAL_CHARS}__(${HASH_CHARS})$`),
  );
  if (namespaced !== null) {
    const localNameMatch = className.match(/_([a-zA-Z][\w-]*)__/);
    return {
      matched: true,
      confidence: "medium",
      ...(localNameMatch?.[1] !== undefined ? { localNameGuess: localNameMatch[1] } : {}),
      pattern: "css-loader-namespaced",
    };
  }

  // Pattern: _[local]_[hash] — css-loader / Vite underscore convention.
  // Example: _button_ab12cd, _button_1a2b3c4d
  const underscore = className.match(new RegExp(`^_(${LOCAL_CHARS})_(${HASH_CHARS})$`));
  if (underscore !== null) {
    return {
      matched: true,
      confidence: "medium",
      ...(underscore[1] !== undefined ? { localNameGuess: underscore[1] } : {}),
      pattern: "css-loader-underscore",
    };
  }

  return { matched: false, confidence: "low", pattern: "unknown" };
};

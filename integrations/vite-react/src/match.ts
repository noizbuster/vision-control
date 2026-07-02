/**
 * Minimal glob matcher for the source-marker plugin's include/exclude config.
 *
 * The plugin only needs a small, predictable subset of glob semantics: a
 * double-star segment (zero or more path segments), a single star (within a
 * segment), `?` (one char), and brace alternation. Pulling in picomatch or
 * fast-glob would be a heavier dependency than the job warrants, so each
 * pattern is compiled to a cached RegExp.
 *
 * Brace alternation is expanded into separate PLAIN glob patterns before
 * compilation, so the compiled regex never sees brace syntax and a wildcard
 * char is never confused with a regex metacharacter. Patterns match
 * POSIX-style paths, and a pattern that does not already begin with a
 * double-star segment is also tried with a recursive-depth prefix, so the
 * default node_modules glob excludes node_modules at any depth in a monorepo,
 * not just at the workspace root.
 */

const cache = new Map<string, RegExp>();

const escapeRegexChar = (ch: string): string => (/[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch);

const compileOne = (pattern: string): RegExp => {
  const cached = cache.get(pattern);
  if (cached !== undefined) return cached;

  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === undefined) break;
    if (ch === "*") {
      const next = pattern[i + 1];
      if (next === "*") {
        const afterStar = pattern[i + 2];
        if (afterStar === "/") {
          regex += "(?:.*/)?";
          i += 3;
          continue;
        }
        regex += ".*";
        i += 2;
        continue;
      }
      regex += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      i += 1;
      continue;
    }
    regex += escapeRegexChar(ch);
    i += 1;
  }
  regex += "$";

  const compiled = new RegExp(regex);
  cache.set(pattern, compiled);
  return compiled;
};

/** Expand brace alternation into separate plain glob patterns. */
const expandBraces = (pattern: string): string[] => {
  const start = pattern.indexOf("{");
  if (start === -1) return [pattern];

  let depth = 0;
  let end = -1;
  for (let i = start; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [pattern];

  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const inner = pattern.slice(start + 1, end);
  const expanded: string[] = [];
  for (const option of inner.split(",")) {
    for (const tail of expandBraces(suffix)) {
      expanded.push(`${prefix}${option}${tail}`);
    }
  }
  return expanded;
};

const testPattern = (pattern: string, posixPath: string): boolean => {
  for (const expanded of expandBraces(pattern.replace(/\\/g, "/"))) {
    if (compileOne(expanded).test(posixPath)) return true;
    if (!expanded.startsWith("**") && compileOne(`**/${expanded}`).test(posixPath)) return true;
  }
  return false;
};

/** Normalize a filesystem path to POSIX separators. */
export const normalizePath = (filePath: string): string => filePath.replace(/\\/g, "/");

/** True when `posixPath` matches ANY of `patterns` (POSIX separators expected). */
export const matchAny = (patterns: readonly string[], posixPath: string): boolean => {
  for (const pattern of patterns) {
    if (testPattern(pattern, posixPath)) return true;
  }
  return false;
};

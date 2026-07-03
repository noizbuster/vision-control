/**
 * Runtime CSS custom-property resolution (VC-V1V2-18 / PRD 15.3).
 *
 * At runtime the browser may hand Vision Control a computed value like
 * `var(--color-primary)` or a bare `--color-primary`. This module resolves such
 * references against the registered design tokens, so an agent knows whether a
 * runtime colour/spacing came from a known token or is an ad-hoc variable.
 *
 * Misleading-success-output guard (load-bearing): when a variable does NOT match
 * any registered token, the resolution returns a `warning` with the code
 * `unresolved-token` and explicitly does NOT fabricate a deterministic patch
 * suggestion. An agent must never be told "replace var(--unknown) with X" when
 * the registry has no basis for that suggestion.
 */
import type { ResolvedToken, TokenRegistry } from "./registry.js";

/** Stable warning code for an unmatched runtime CSS variable. */
export const UNRESOLVED_TOKEN_WARNING_CODE = "unresolved-token";

/**
 * Pattern matching a `var(--name)` reference. Captures the leading `--name`
 * (without the `var(` wrapper). Supports the optional fallback:
 * `var(--foo, 1rem)` — the primary name is captured.
 */
const VAR_REFERENCE_PATTERN = /var\(\s*(--[\w-]+)/;

/**
 * The outcome of resolving one runtime value against the registry.
 */
export interface RuntimeCssVariableResolution {
  /** The original input string (e.g. `var(--color-primary)` or `--color-primary`). */
  readonly input: string;
  /** The CSS custom-property name extracted from the input, if any. */
  readonly variableName: string | undefined;
  /** The matched token, or `undefined` when no token matches. */
  readonly resolved: ResolvedToken | undefined;
  /**
   * Warning message when the variable is unresolved. Always absent when
   * `resolved` is defined. Never carries a patch suggestion.
   */
  readonly warning: string | undefined;
}

const isCssVariableName = (input: string): boolean => input.startsWith("--");

/**
 * Extract the custom-property name from a runtime value. Accepts either a bare
 * `--name` or a `var(--name)` / `var(--name, fallback)` reference. Returns
 * `undefined` when the input is not a CSS custom-property reference.
 */
export const extractVariableName = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (isCssVariableName(trimmed)) return trimmed;
  const match = VAR_REFERENCE_PATTERN.exec(trimmed);
  return match?.[1];
};

/**
 * Attempt to resolve `input` to a registered token. The lookup tries, in order:
 * 1. The exact variable name (e.g. `--color-primary` registered as a token name).
 * 2. The name without the `--` prefix (e.g. `color-primary`).
 * 3. An alias match (e.g. a token aliased to `--color-primary`).
 *
 * Returns a {@link RuntimeCssVariableResolution} with `resolved` set on a match,
 * or `warning` set (code `unresolved-token`) on a miss. Never both. Never a
 * patch suggestion.
 */
export const resolveRuntimeCssVariable = (
  input: string,
  registry: TokenRegistry,
): RuntimeCssVariableResolution => {
  const variableName = extractVariableName(input);
  if (variableName === undefined) {
    // Not a CSS variable reference at all — nothing to resolve, no warning.
    return { input, variableName: undefined, resolved: undefined, warning: undefined };
  }

  // 1. Exact name match.
  const exact = registry.lookup(variableName);
  if (exact !== undefined) {
    return { input, variableName, resolved: exact, warning: undefined };
  }

  // 2. Strip the leading `--` and try the bare name.
  const stripped = variableName.slice(2);
  const byBareName = registry.lookup(stripped);
  if (byBareName !== undefined) {
    return { input, variableName, resolved: byBareName, warning: undefined };
  }

  // 3. Alias match (token may be registered with `--color-primary` as an alias).
  const byAlias = registry.lookupByAlias(variableName);
  if (byAlias !== undefined) {
    return { input, variableName, resolved: byAlias, warning: undefined };
  }

  // 4. Alias match on the stripped name.
  const byStrippedAlias = registry.lookupByAlias(stripped);
  if (byStrippedAlias !== undefined) {
    return { input, variableName, resolved: byStrippedAlias, warning: undefined };
  }

  // Unresolved: surface a warning, NO deterministic suggestion.
  return {
    input,
    variableName,
    resolved: undefined,
    warning:
      `unresolved-token: "${input}" did not match any registered design token; ` +
      "no deterministic patch suggestion available",
  };
};

/**
 * Resolve every `var(--x)` reference found in an arbitrary CSS value string.
 * Returns one resolution per reference found (a value with no `var()` yields an
 * empty array). Useful for scanning a computed-style declaration that chains
 * multiple variables: `var(--space) var(--gap)`.
 */
export const resolveAllVarReferences = (
  cssValue: string,
  registry: TokenRegistry,
): readonly RuntimeCssVariableResolution[] => {
  const pattern = /var\(\s*(--[\w-]+)/g;
  const out: RuntimeCssVariableResolution[] = [];
  let match: RegExpExecArray | null = pattern.exec(cssValue);
  while (match !== null) {
    const ref = match[0];
    out.push(resolveRuntimeCssVariable(ref, registry));
    match = pattern.exec(cssValue);
  }
  return out;
};

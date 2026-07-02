/**
 * HTML content-model guards for reparent safety (PRD section 9.4). A reparent
 * that would violate the HTML content model (e.g. a `<div>` dropped directly
 * into a `<ul>`, which may only contain `<li>`) is rejected at intent time so
 * the preview never renders an invalid tree.
 *
 * The rule set is MVP-scoped: it covers the structurally strict parents the PRD
 * calls out (`ul`/`ol`, `table` families, `select`, `dl`). All other parents
 * default to "accepts flow content" (valid) — the common case for `div`,
 * `section`, `main`, etc. This keeps the guard list small while still catching
 * the violations the PRD QA scenario explicitly tests.
 *
 * Tag names are case-insensitive; callers should pass lowercase, but the guard
 * normalizes defensively.
 */

/** Maps a structurally-strict parent tag to its allowed direct-child tags. */
const STRICT_PARENTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["ul", new Set(["li"])],
  ["ol", new Set(["li"])],
  ["table", new Set(["thead", "tbody", "tfoot", "caption", "colgroup", "col", "tr"])],
  ["thead", new Set(["tr"])],
  ["tbody", new Set(["tr"])],
  ["tfoot", new Set(["tr"])],
  ["tr", new Set(["td", "th"])],
  ["select", new Set(["option", "optgroup"])],
  ["optgroup", new Set(["option"])],
  ["dl", new Set(["dt", "dd"])],
]);

/** Human-readable reason for each strict parent's restriction. */
const PARENT_REASON: ReadonlyMap<string, string> = new Map([
  ["ul", "<ul> may only contain <li> elements"],
  ["ol", "<ol> may only contain <li> elements"],
  ["table", "<table> may only contain thead/tbody/tfoot/caption/colgroup/tr"],
  ["thead", "<thead> may only contain <tr>"],
  ["tbody", "<tbody> may only contain <tr>"],
  ["tfoot", "<tfoot> may only contain <tr>"],
  ["tr", "<tr> may only contain <td>/<th>"],
  ["select", "<select> may only contain <option>/<optgroup>"],
  ["optgroup", "<optgroup> may only contain <option>"],
  ["dl", "<dl> may only contain <dt>/<dd>"],
]);

export interface ContentModelViolation {
  readonly code: "INVALID_DROP_TARGET";
  readonly parent: string;
  readonly child: string;
  readonly reason: string;
}

export type ValidateReparentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: ContentModelViolation };

/**
 * True when `child` is a permitted direct child of `parent` per the HTML
 * content model. Unknown parents (not in {@link STRICT_PARENTS}) accept flow
 * content and therefore return `true`.
 */
export const isValidChild = (parent: string, child: string): boolean => {
  const p = parent.trim().toLowerCase();
  const c = child.trim().toLowerCase();
  const allowed = STRICT_PARENTS.get(p);
  if (allowed === undefined) {
    return true;
  }
  return allowed.has(c);
};

/**
 * Validate a reparent against the content model. Returns `{ ok: false,
 * violation }` with an `INVALID_DROP_TARGET` code when the child is not a
 * permitted direct child of the parent; `{ ok: true }` otherwise.
 */
export const validateReparent = (parent: string, child: string): ValidateReparentResult => {
  if (isValidChild(parent, child)) {
    return { ok: true };
  }
  const p = parent.trim().toLowerCase();
  const reason = PARENT_REASON.get(p) ?? `<${p}> rejects <${child.trim().toLowerCase()}>`;
  return {
    ok: false,
    violation: {
      code: "INVALID_DROP_TARGET",
      parent: p,
      child: child.trim().toLowerCase(),
      reason,
    },
  };
};

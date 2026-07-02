/**
 * Stable CSS selector generation — pure, DOM-free.
 *
 * The browser adapter (inspector-core, task 14) reads DOM data into an
 * {@link ElementDescriptor}; this module only computes the selector string.
 * It NEVER touches `document`/`window`, so it is safe in the daemon and in
 * tests.
 *
 * Strategy (in priority order):
 *   1. `data-vc-source` attribute — the source marker (task 22). Most stable;
 *      uniquely identifies the source location across reloads/HMR.
 *   2. element `id` — stable as long as the id is page-unique and not
 *      auto-generated.
 *   3. tag + stable classes — non-volatile classes (filters out CSS-modules
 *      hashes, emotion/styled-components generated names).
 *   4. ancestry nth-child path — last resort; brittle but deterministic.
 */

/** A single ancestor node's DOM-relevant data (caller provides this). */
export interface AncestorDescriptor {
  readonly tagName: string;
  readonly id?: string;
  readonly className?: string;
  /** 1-based index among the ancestor's siblings (for nth-child paths). */
  readonly nthChild?: number;
}

/**
 * DOM-relevant data for the target element. The caller reads this off the live
 * DOM; this module never reads the DOM itself.
 */
export interface ElementDescriptor {
  readonly tagName: string;
  readonly id?: string;
  /** Space-separated class string, as exposed by `element.className`. */
  readonly className?: string;
  /** Attribute map; `data-vc-source` is read from here. */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Ancestry from the document root down to (but not including) the element. */
  readonly ancestry?: ReadonlyArray<AncestorDescriptor>;
  /** 1-based index among the element's own siblings (for nth-child paths). */
  readonly nthChild?: number;
}

const SOURCE_MARKER_ATTR = "data-vc-source";

/**
 * Heuristic for a "volatile" class name — one that is likely to change across
 * builds/HMR and therefore not a stable selector. Conservative: catches
 * CSS-modules hashes (`name__hash`), styled-components (`sc-…`), emotion
 * (`css-…`), and standalone base62-ish hashes (6+ alphanumeric). Everything
 * else is treated as stable.
 */
const isVolatileClass = (cls: string): boolean =>
  /__[a-z0-9]{5,}/i.test(cls) ||
  /^sc-[a-z0-9]/i.test(cls) ||
  /^css-[a-z0-9]/i.test(cls) ||
  /^[a-z0-9]{6,}$/i.test(cls);

const splitClasses = (className: string | undefined): string[] =>
  className === undefined ? [] : className.split(/\s+/).filter((c) => c.length > 0);

/**
 * Escape a CSS identifier (id or class) for safe embedding in a selector.
 * Mirrors CSSOM's identifier escaping for the characters that matter.
 */
const escapeIdent = (ident: string): string =>
  ident.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");

/** Build the `tag.stableClass1.stableClass2` selector segment. */
const tagClassSegment = (tagName: string, classes: readonly string[]): string => {
  const stable = classes.filter((c) => !isVolatileClass(c));
  if (stable.length === 0) return escapeIdent(tagName);
  return `${escapeIdent(tagName)}${stable.map((c) => `.${escapeIdent(c)}`).join("")}`;
};

/** Build an ancestor's path segment, preferring id then tag+class. */
const ancestorSegment = (ancestor: AncestorDescriptor): string => {
  if (ancestor.id !== undefined && ancestor.id.length > 0) return `#${escapeIdent(ancestor.id)}`;
  const classes = splitClasses(ancestor.className);
  return tagClassSegment(ancestor.tagName, classes);
};

/** Build the brittle ancestry nth-child path. */
const nthChildPath = (descriptor: ElementDescriptor): string => {
  const segments: string[] = [];
  for (const ancestor of descriptor.ancestry ?? []) {
    const tag = ancestorSegment(ancestor);
    segments.push(ancestor.nthChild !== undefined ? `${tag}:nth-child(${ancestor.nthChild})` : tag);
  }
  const selfClasses = splitClasses(descriptor.className);
  const selfTag = tagClassSegment(descriptor.tagName, selfClasses);
  segments.push(
    descriptor.nthChild !== undefined ? `${selfTag}:nth-child(${descriptor.nthChild})` : selfTag,
  );
  return segments.join(" > ");
};

export interface GenerateSelectorOptions {
  readonly descriptor: ElementDescriptor;
}

/**
 * Generate a stable CSS selector for an element. Pure; never touches the DOM.
 *
 * Priority: `data-vc-source` attribute > `id` > tag + stable classes > ancestry
 * nth-child path. Returns the shortest stable selector available.
 */
export const generateStableSelector = (opts: GenerateSelectorOptions): string => {
  const { descriptor } = opts;

  // 1. Source marker attribute (most stable).
  const sourceMarker =
    descriptor.attributes !== undefined ? descriptor.attributes[SOURCE_MARKER_ATTR] : undefined;
  if (sourceMarker !== undefined && sourceMarker.length > 0) {
    return `[${SOURCE_MARKER_ATTR}="${escapeAttrValue(sourceMarker)}"]`;
  }

  // 2. Element id.
  if (descriptor.id !== undefined && descriptor.id.length > 0) {
    return `#${escapeIdent(descriptor.id)}`;
  }

  // 3. Tag + stable classes.
  const classes = splitClasses(descriptor.className);
  const stable = classes.filter((c) => !isVolatileClass(c));
  if (stable.length > 0) {
    return tagClassSegment(descriptor.tagName, classes);
  }

  // 4. Ancestry nth-child path (last resort).
  return nthChildPath(descriptor);
};

/** Escape an attribute value for safe embedding in `[attr="…"]`. */
const escapeAttrValue = (value: string): string => value.replace(/(["\\])/g, "\\$1");

/**
 * Runtime/source identity separation.
 *
 * Vision Control addresses every DOM element with TWO independent identifiers
 * (PRD 14.2). Keeping them separate is the backbone of HMR re-identification
 * (PRD 18.3) and of the "preview is not source" guarantee.
 *
 * - `RuntimeId` is **per DOM instance** and **ephemeral**. The content script
 *   assigns it (via a WeakMap + attribute) when an element mounts. It dies on
 *   reload, HMR, re-render, or re-ordering. Two list items rendered from the
 *   same JSX line have DIFFERENT runtime ids.
 *
 * - `SourceId` is **opaque, stable, and workspace-relative**. The source-marker
 *   plugin (task 22) emits it from build time and injects it as
 *   `data-vc-source`. It survives reloads and HMR. Two list items rendered from
 *   the same JSX line SHARE a source id (they are the same source location).
 *
 * ## Why runtimeId and sourceId must NEVER be the same value
 *
 * If a single id played both roles, re-rendering a list would either lose the
 * stable source link (new instance id) or confuse distinct DOM instances (one
 * shared id). The separation lets the verification engine re-find an element
 * after HMR by source id first, then disambiguate to a fresh runtime id
 * (PRD 18.3 priority order). It also lets a persisted change target the source
 * (stable) while the live overlay tracks the instance (ephemeral).
 *
 * ## Why a sourceId must NEVER contain an absolute filesystem path
 *
 * Source ids cross the wire (extension -> daemon) and are persisted (storage,
 * change journal). An absolute path would leak the developer's machine layout
 * into shared artifacts, break workspace portability, and create a path-traversal
 * surface for any tool that interprets the id. The source-marker plugin emits
 * opaque hashes or workspace-relative encoded ids; this module enforces that
 * contract at the boundary so an accidental absolute path fails loudly.
 */

/**
 * Branded runtime id: an ephemeral, per-DOM-instance string assigned by the
 * content script. At runtime it is just a string (JSON-safe); the brand gives
 * compile-time separation from {@link SourceId}.
 */
export type RuntimeId = string & { readonly __brand: "RuntimeId" };

/**
 * Branded source id: an opaque, stable, workspace-relative string emitted by
 * the source-marker plugin. At runtime it is just a string (JSON-safe); the
 * brand gives compile-time separation from {@link RuntimeId}.
 *
 * NOTE: the wire schemas in {@link "./element-ref.js"} infer plain `string`
 * (for JSON portability and forward compatibility). These branded types are a
 * stricter layer for code that constructs ids and wants compile-time discipline.
 */
export type SourceId = string & { readonly __brand: "SourceId" };

/**
 * Matches an absolute filesystem path: POSIX (`/usr/...`) or Windows
 * (`C:\...`, `C:/...`). Used to reject source ids that accidentally embed a
 * real path.
 */
export const ABSOLUTE_PATH_PATTERN = /^\/|^[A-Za-z]:[\\/]/;

/** True when `value` looks like an absolute filesystem path. */
export const isAbsolutePath = (value: string): boolean => ABSOLUTE_PATH_PATTERN.test(value);

/**
 * Typed error raised when a source id is constructed from an absolute path or
 * an empty string. Constructed with a code so callers can discriminate.
 */
export class InvalidSourceIdError extends Error {
  readonly code: "EMPTY" | "ABSOLUTE_PATH";

  constructor(code: "EMPTY" | "ABSOLUTE_PATH", value: string) {
    super(`Invalid source id (${code}): ${JSON.stringify(value)}`);
    this.name = "InvalidSourceIdError";
    this.code = code;
  }
}

/**
 * Construct a validated {@link SourceId}. Throws {@link InvalidSourceIdError}
 * if `value` is empty or matches an absolute path. Use this at every boundary
 * where a source id enters the system (content script, daemon import).
 */
export const createSourceId = (value: string): SourceId => {
  if (value.length === 0) throw new InvalidSourceIdError("EMPTY", value);
  if (isAbsolutePath(value)) throw new InvalidSourceIdError("ABSOLUTE_PATH", value);
  return value as SourceId;
};

/**
 * Construct a {@link RuntimeId}. Throws if `value` is empty. Runtime ids are
 * per-instance and may otherwise be any non-empty opaque string.
 */
export const createRuntimeId = (value: string): RuntimeId => {
  if (value.length === 0) throw new Error("Runtime id must be a non-empty string");
  return value as RuntimeId;
};

/**
 * Two elements share a source lineage when their (optional) source ids are
 * equal. Elements with no source id have no stable lineage.
 *
 * Accepts plain strings (not only the branded {@link SourceId}) so it
 * interoperates with wire/schema-inferred values, which are plain strings.
 */
export const isSameSource = (a: string | undefined, b: string | undefined): boolean =>
  a !== undefined && b !== undefined && a === b;

/**
 * Two elements are distinct DOM instances whenever their runtime ids differ.
 * This is the disambiguator for repeated renders of the same JSX line.
 *
 * Accepts plain strings (not only the branded {@link RuntimeId}) so it
 * interoperates with wire/schema-inferred values.
 */
export const isDistinctRuntime = (a: string, b: string): boolean => a !== b;

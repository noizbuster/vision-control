/**
 * Typed errors thrown by structural and free-position command factories when a
 * layout guard rejects the requested operation.
 */

/** Discriminator for {@link UnsupportedLayoutError}. */
export type UnsupportedLayoutErrorCode =
  /**
   * PRD §9.2.C + Appendix D.2 (constraint 2): a normal-flow element would be
   * taken out of flow (→ absolute/fixed) without a positioned ancestor or an
   * explicit user opt-in. Also used when a positioned-only command
   * (move-to-front/back) targets a non-positioned element.
   */
  | "UNSUPPORTED_LAYOUT"
  /**
   * The requested positioning mode cannot be expressed by the MVP
   * `position-element` operation kind. `"transform"` requires a transform-edit
   * op kind not in MVP scope; `"relative-offset"` is supported.
   */
  | "UNSUPPORTED_POSITIONING_MODE";

/**
 * Thrown when a structural or free-position command cannot run in the supplied
 * layout context. Carries a machine-readable `code` so callers distinguish the
 * D41 normal-flow guard from other unsupported scenarios.
 */
export class UnsupportedLayoutError extends Error {
  readonly code: UnsupportedLayoutErrorCode;

  constructor(
    code: UnsupportedLayoutErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "UnsupportedLayoutError";
    this.code = code;
  }
}

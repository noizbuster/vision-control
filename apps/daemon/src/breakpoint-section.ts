/**
 * Derive the V1 breakpoint context (VC-V1V2-10) from the page-session emission.
 *
 * The content runtime resolves the active breakpoint label via `matchMedia`
 * (plan task 7) and the daemon stores it on `page.navigated`
 * (`PageSessionStore`). This helper maps that stored state into the
 * `BreakpointContext` the context-compiler consumes.
 *
 * The stored `activeBreakpoint` label IS the viewport label the compiler emits
 * as `activeViewport`; it is also the framework responsive prefix (e.g.
 * Tailwind `md`/`lg`), so it maps to both. The compiler enriches the result
 * with `scopedChangeCount` derived from the changeset.
 *
 * Honesty contract: when no breakpoint label was reported (no session, or a
 * session that reported only viewport dimensions without a resolved label),
 * this returns `undefined` so the compiler omits the section — the daemon never
 * invents a breakpoint from a pixel width.
 */
import type { BreakpointContext } from "@vision-control/context-compiler";

/**
 * Minimal structural view of a page session. Deliberately decoupled from
 * `PageSessionState` (business-handlers.ts) so this pure helper has no
 * daemon-internal dependency and is unit-testable in isolation.
 */
export interface PageSessionBreakpointInput {
  readonly activeBreakpoint?: string;
}

/**
 * Map a page-session state (or `undefined` when no session exists) to a
 * `BreakpointContext`, or `undefined` when no breakpoint label is available.
 */
export const resolvePageSessionBreakpoint = (
  session: PageSessionBreakpointInput | undefined,
): BreakpointContext | undefined => {
  const activeViewport = session?.activeBreakpoint;
  if (activeViewport === undefined) return undefined;
  return { activeViewport, responsivePrefix: activeViewport };
};

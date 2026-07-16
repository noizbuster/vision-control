/**
 * Breakpoint controller for the overlay runtime (plan task 7).
 *
 * Owns the active-breakpoint lifecycle: the {@link BreakpointResolver}, the
 * viewport resize re-resolution, the daemon-delivered `screens` bus handler,
 * and enrichment of the selection summary with the resolved `activeBreakpoint`.
 *
 * Boundary: the content runtime MUST NOT import `@vision-control/tailwind`
 * (platform:node). The daemon delivers `screens` via a `viewport-screens` bus
 * message; this controller updates the resolver, which falls back to a hardcoded
 * default scale when none has arrived.
 */

import type { SelectionSummary } from "@vision-control/inspector-core";

import {
  createSelectionSummaryClearedMessage,
  createSelectionSummaryMessage,
} from "../messaging/panel-messages.js";
import type { BusMessage, BusRoute } from "../messaging/types.js";
import { type BreakpointResolver, createBreakpointResolver } from "./breakpoint-resolver.js";

export interface BreakpointControllerBus {
  readonly send: (route: BusRoute, message: BusMessage) => void;
  readonly on: (messageType: string, handler: (message: BusMessage) => void) => () => void;
}

export interface BreakpointControllerOptions {
  readonly window: Window;
  readonly bus: BreakpointControllerBus;
  readonly screens?: readonly string[];
}

export interface BreakpointController {
  /** Enrich + track + publish a selection summary with the active breakpoint. */
  readonly onSelection: (summary: SelectionSummary, selectionRevision: number) => void;
  /** Drop the tracked summary (deselect). */
  readonly clear: (selectionRevision: number) => void;
  /** Drop tracked selection state without publishing (runtime stop). */
  readonly invalidate: () => void;
  /** Attach the resize listener + screens bus handler. */
  readonly attach: () => void;
  readonly detach: () => void;
  readonly dispose: () => void;
}

export function createBreakpointController(
  options: BreakpointControllerOptions,
): BreakpointController {
  const { window: win, bus } = options;
  const resolver: BreakpointResolver = createBreakpointResolver({
    window: win,
    ...(options.screens !== undefined ? { screens: options.screens } : {}),
  });
  let lastSummary: SelectionSummary | null = null;
  let lastSelectionRevision: number | null = null;

  const publish = (summary: SelectionSummary, selectionRevision: number): void => {
    lastSummary = summary;
    lastSelectionRevision = selectionRevision;
    bus.send("panel", createSelectionSummaryMessage(summary, selectionRevision));
  };

  const onSelection = (summary: SelectionSummary, selectionRevision: number): void => {
    publish({ ...summary, activeBreakpoint: resolver.resolve() }, selectionRevision);
  };

  const invalidate = (): void => {
    lastSummary = null;
    lastSelectionRevision = null;
  };

  const clear = (selectionRevision: number): void => {
    invalidate();
    bus.send("panel", createSelectionSummaryClearedMessage(selectionRevision));
  };

  const republishResolvedBreakpoint = (): void => {
    if (lastSummary === null || lastSelectionRevision === null) return;
    const next = resolver.resolve();
    if (next === lastSummary.activeBreakpoint) return;
    publish({ ...lastSummary, activeBreakpoint: next }, lastSelectionRevision);
  };

  const onViewportScreens = (message: BusMessage): void => {
    const payload = message.payload as { readonly screens?: unknown } | undefined;
    if (payload === undefined || !Array.isArray(payload.screens)) return;
    const screens = payload.screens.filter((s): s is string => typeof s === "string");
    if (screens.length === 0) return;
    resolver.setScreens(screens);
    republishResolvedBreakpoint();
  };

  let resizeRafId: number | null = null;
  const flushResize = (): void => {
    resizeRafId = null;
    republishResolvedBreakpoint();
  };
  const onViewportResize = (): void => {
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(flushResize);
  };
  const cancelResizeRaf = (): void => {
    if (resizeRafId !== null) {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
  };

  let screensUnsub: (() => void) | null = null;

  const attach = (): void => {
    if (screensUnsub !== null) return;
    win.addEventListener("resize", onViewportResize);
    screensUnsub = bus.on("viewport-screens", onViewportScreens);
  };

  const detach = (): void => {
    cancelResizeRaf();
    win.removeEventListener("resize", onViewportResize);
    screensUnsub?.();
    screensUnsub = null;
  };

  const dispose = (): void => {
    detach();
    invalidate();
  };

  return { onSelection, clear, invalidate, attach, detach, dispose };
}

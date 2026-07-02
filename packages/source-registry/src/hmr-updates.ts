import type { SourceRegistry } from "./registry.js";
import type { SourceEntry } from "./types.js";

/**
 * HMR integration for the source registry (PRD 14.3 step 6 / 18.3).
 *
 * When Vite hot-reloads a JSX/TSX module, every source marker previously
 * emitted for that file is stale: line/column offsets may have shifted, an
 * element may have been removed, or a new one added. The registry must drop the
 * file's old entries and accept the fresh set the next transform produces.
 *
 * The Vite plugin owns WHEN this runs (its `handleHotUpdate` hook fires once
 * per accepted module); this module owns WHAT happens: a deterministic
 * clear-then-register applied to a registry. Keeping it as a free function (not
 * a hook on the registry) lets the plugin and any other transport reuse the
 * same semantics and lets tests assert the diff directly.
 */

/** A single module update: the file that changed and the entries its fresh source produced. */
export interface HmrUpdateEvent {
  readonly workspaceRelativePath: string;
  readonly entries: readonly SourceEntry[];
}

/** Outcome of {@link applyHmrUpdate}: how many stale entries left and fresh ones landed. */
export interface HmrUpdateResult {
  readonly removed: number;
  readonly registered: number;
}

/**
 * Apply a module update atomically: clear the file's stale entries, then
 * register the fresh set. Runtime bindings that pointed at removed sources are
 * dropped by {@link SourceRegistry.clearForFile}. Returns the before/after
 * counts so the plugin (or a test) can observe the swap.
 */
export const applyHmrUpdate = (
  registry: SourceRegistry,
  event: HmrUpdateEvent,
): HmrUpdateResult => {
  const removed = registry.clearForFile(event.workspaceRelativePath);
  for (const entry of event.entries) registry.register(entry);
  return { removed, registered: event.entries.length };
};

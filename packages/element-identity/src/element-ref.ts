import { z } from "zod";

/**
 * `ElementRef` is the minimal, DOM-free description of a single element. It is
 * the shared reference type owned by this package and consumed by geometry,
 * change-ir, inspector-core, and the protocol.
 *
 * It deliberately carries NO geometry and NO DOM handles: those live in browser
 * packages. All fields are plain JSON-serializable values so an ElementRef
 * round-trips through the protocol wire and SQLite storage unchanged.
 *
 * Field semantics:
 * - `runtimeId` — ephemeral, per-DOM-instance id (see runtime-source-separation).
 *   Unique across the live DOM at capture time.
 * - `sourceId` — opaque, stable, workspace-relative source id emitted by the
 *   source-marker plugin. Optional: not every element is source-marked.
 *   NEVER an absolute filesystem path.
 * - `selector` — a stable CSS selector for this element (see selectors.ts).
 *   Optional; absent when no stable selector could be computed.
 * - `tagName` — lowercase tag name (e.g. "button").
 * - `role` — ARIA role, if any.
 * - `name` — accessible name, if any.
 */
export const ElementRefSchema = z.object({
  runtimeId: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  tagName: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
});

export type ElementRef = z.infer<typeof ElementRefSchema>;

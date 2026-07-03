import { z } from "zod";

import { ElementRefSchema } from "./element-ref.js";

/**
 * Branded multi-select group id: the stable identity of a selection group.
 * Constructed via {@link createMultiSelectGroupId}; on the wire it is a plain
 * string (see {@link MultiSelectGroupIdSchema}) per MVP pattern D22 (branded at
 * construction, plain string on the wire).
 */
export type MultiSelectGroupId = string & { readonly __brand: "MultiSelectGroupId" };

/**
 * Wire schema for a multi-select group id. Infers plain `string` (no brand) so
 * the id round-trips through JSON / SQLite / the protocol envelope unchanged.
 */
export const MultiSelectGroupIdSchema = z.string().min(1);

/** Construct a branded {@link MultiSelectGroupId}. Throws if `value` is empty. */
export const createMultiSelectGroupId = (value: string): MultiSelectGroupId => {
  if (value.length === 0) throw new Error("MultiSelect group id must be a non-empty string");
  return value as MultiSelectGroupId;
};

/** Runtime narrowing helper. The brand is erased at runtime; this is `true` for any string. */
export const isMultiSelectGroupId = (value: string): value is MultiSelectGroupId =>
  value.length > 0;

/**
 * The frame an element lives in. Cross-origin iframes are deliberately NOT
 * representable here: they are never selectable (the content script cannot
 * reach into them). "top" is the main document; "same-origin-iframe" is a
 * same-origin `<iframe>` whose document is reachable.
 */
export const MultiSelectFrameKindSchema = z.enum(["top", "same-origin-iframe"]);
export type MultiSelectFrameKind = z.infer<typeof MultiSelectFrameKindSchema>;

/**
 * The shadow context an element lives in. Closed shadow roots are deliberately
 * NOT representable: their contents cannot be inspected, so they are never
 * selectable. A group may mix neither a closed root with anything else nor
 * (per the constraint rules) an open root with the light DOM.
 */
export const MultiSelectShadowKindSchema = z.enum(["light-dom", "open-shadow-root"]);
export type MultiSelectShadowKind = z.infer<typeof MultiSelectShadowKindSchema>;

/**
 * A selection-group member: an {@link ElementRef} extended with the frame and
 * shadow-root location metadata the group constraint checker needs to enforce
 * that all members share a single selectable context.
 *
 * - `frameId` — which frame the element lives in (top frame is a conventional
 *   id such as "main" or "0"; a same-origin iframe carries its frame id).
 * - `frameKind` — {@link MultiSelectFrameKind}; cross-origin is excluded.
 * - `shadowKind` — {@link MultiSelectShadowKind}; closed shadow is excluded.
 */
export const MultiSelectMemberSchema = ElementRefSchema.extend({
  frameId: z.string().min(1),
  frameKind: MultiSelectFrameKindSchema,
  shadowKind: MultiSelectShadowKindSchema,
});

export type MultiSelectMember = z.infer<typeof MultiSelectMemberSchema>;

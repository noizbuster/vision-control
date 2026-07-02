import { z } from "zod";

import { type ElementRef, ElementRefSchema } from "./element-ref.js";

/**
 * Confidence that this identity will re-identify the same element after a
 * reload/HMR (PRD 18.3 priority order).
 *
 * - `high` — a source id is present and the DOM fingerprint is stable.
 * - `medium` — no source id, but a stable role/name + selector match.
 * - `low` — only a DOM fingerprint or nth-child path is available.
 */
export const IdentityConfidenceSchema = z.enum(["high", "medium", "low"]);
export type IdentityConfidence = z.infer<typeof IdentityConfidenceSchema>;

/**
 * `SelectionIdentity` extends {@link ElementRef} with the data the selection and
 * verification engines need to (a) locate the element across frames/tabs and
 * (b) re-find it after HMR.
 *
 * Additional fields:
 * - `frameId` — which frame/iframe the element lives in (top frame is a
 *   conventional id such as "main" or "0").
 * - `tabId` — optional browser tab id.
 * - `fingerprint` — DOM path fingerprint (see fingerprint.ts) for stale
 *   detection: if the captured fingerprint differs from a freshly computed one,
 *   the DOM has changed and the identity is stale.
 * - `confidence` — re-identification confidence (see {@link IdentityConfidence}).
 * - `sourceSnippet` — optional short source snippet around the source location,
 *   for context export. Workspace-relative; NEVER an absolute path.
 */
export const SelectionIdentitySchema = ElementRefSchema.extend({
  frameId: z.string().min(1),
  tabId: z.string().optional(),
  fingerprint: z.string().min(1),
  confidence: IdentityConfidenceSchema,
  sourceSnippet: z.string().optional(),
});

export type SelectionIdentity = z.infer<typeof SelectionIdentitySchema>;

/**
 * Build a {@link SelectionIdentity} from a base {@link ElementRef} plus the
 * selection-specific fields. Keeps construction explicit so callers cannot
 * accidentally drop the base reference fields.
 */
export const toSelectionIdentity = (
  ref: ElementRef,
  additions: {
    readonly frameId: string;
    readonly fingerprint: string;
    readonly confidence: IdentityConfidence;
    readonly tabId?: string;
    readonly sourceSnippet?: string;
  },
): SelectionIdentity =>
  additions.tabId !== undefined && additions.sourceSnippet !== undefined
    ? { ...ref, ...additions }
    : additions.tabId !== undefined
      ? {
          ...ref,
          frameId: additions.frameId,
          fingerprint: additions.fingerprint,
          confidence: additions.confidence,
          tabId: additions.tabId,
        }
      : additions.sourceSnippet !== undefined
        ? {
            ...ref,
            frameId: additions.frameId,
            fingerprint: additions.fingerprint,
            confidence: additions.confidence,
            sourceSnippet: additions.sourceSnippet,
          }
        : {
            ...ref,
            frameId: additions.frameId,
            fingerprint: additions.fingerprint,
            confidence: additions.confidence,
          };

import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * A rectangular capture region in CSS pixels, relative to the element or
 * viewport origin depending on caller context.
 */
export const CaptureRegionRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * Reference an opt-in screenshot crop artifact by id. The artifact blob is
 * NEVER carried here — it lives in storage (`screenshot_artifacts`), behind a
 * retention/masking policy (ADR-011). This operation records only the metadata
 * ref, capture region, redaction report ref, and optional retention expiry.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 *
 * Inverse (`computeInverse`): a no-op marker — the screenshot ref is metadata,
 * not a state change. The inverse re-references the same artifact with a fresh
 * id and `inverseOf` linking back.
 */
export const ScreenshotCropRefOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("screenshot-crop-ref"),
  artifactId: z.string().min(1),
  captureRegion: CaptureRegionRectSchema,
  redactionReport: z.string().optional(),
  retentionExpiresAt: z.number().int().nonnegative().optional(),
});

export type CaptureRegionRect = z.infer<typeof CaptureRegionRectSchema>;
export type ScreenshotCropRefOperation = z.infer<typeof ScreenshotCropRefOperationSchema>;

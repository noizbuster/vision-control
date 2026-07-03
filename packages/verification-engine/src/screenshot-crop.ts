/**
 * Opt-in element screenshot crop capture (VC-V1V2-15 / ADR-011).
 *
 * The orchestration that turns an explicit opt-in request into a redacted
 * crop artifact:
 *
 *   1. enforce the opt-in gate (no capture unless explicitly enabled);
 *   2. suppress the Vision Control overlay so it never appears in the image;
 *   3. discover pre-capture sensitive regions and mask them in device space;
 *   4. capture the element region scaled by the device pixel ratio;
 *   5. restore the overlay (always, even on capture failure);
 *   6. re-check post-capture — if an overlay or late-rendered value slipped
 *      past the pre-mask set, DISCARD the bytes and abort.
 *
 * Pure + isomorphic. Pixel capture, overlay toggling, and DOM scanning live in
 * injected adapters; this module only coordinates and computes DPR-correct
 * coordinates + the redaction report.
 */

import type { Rect } from "@vision-control/geometry";

import {
  buildRedactionReport,
  type DomRegionCandidate,
  discoverRedactableRegions,
  type RedactableRegion,
  type RedactionReport,
  recheckCapture,
} from "./screenshot-redaction.js";

/** A rectangle in CSS pixels. */
export interface CssRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangle in device pixels (post-DPR scaling). */
export interface DeviceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the caller wants to capture. */
export interface CaptureRequest {
  /** CSS-pixel bounds of the element to capture. */
  readonly targetBounds: Rect;
  /** Device pixel ratio (must be positive). */
  readonly devicePixelRatio: number;
}

/** Explicit opt-in gate. `enabled` MUST be `true` for any capture to occur. */
export interface ScreenshotOptIn {
  readonly enabled: boolean;
}

/** Hides the Vision Control overlay before capture, restores it after. */
export interface OverlaySuppressor {
  suppress(): void;
  restore(): void;
}

/** Browser-side pixel capture with device-space masks painted over regions. */
export interface ScreenshotCaptureAdapter {
  captureMaskedDeviceRegion(
    deviceRegion: DeviceRect,
    maskRegions: readonly DeviceRect[],
  ): { readonly bytes: Uint8Array; readonly contentHash: string };
}

/** DOM lens used twice: once before capture (pre-mask), once after (re-check). */
export interface ScreenshotRedactionLens {
  readonly preCaptureCandidates: () => readonly DomRegionCandidate[];
  readonly postCaptureCandidates: () => readonly DomRegionCandidate[];
}

/** Full input to {@link captureScreenshotCrop}. */
export interface ScreenshotCaptureInput {
  readonly optIn: ScreenshotOptIn;
  readonly request: CaptureRequest;
  readonly overlay: OverlaySuppressor;
  readonly capture: ScreenshotCaptureAdapter;
  readonly redaction: ScreenshotRedactionLens;
}

/** Result of a crop capture attempt. */
export interface ScreenshotCropResult {
  readonly captured: boolean;
  readonly abortReason?: "opt-in-required" | "post-capture-recheck-failed";
  readonly captureRegion: CssRect;
  readonly deviceRegion: DeviceRect;
  readonly bytes?: Uint8Array;
  readonly contentHash?: string;
  readonly redactionReport: RedactionReport;
}

/**
 * Scale a CSS-pixel rectangle into device pixels. Every coordinate is rounded
 * so device pixels map to whole pixels (no subpixel tearing in the crop).
 */
export function scaleToDevice(css: CssRect, devicePixelRatio: number): DeviceRect {
  if (devicePixelRatio <= 0) {
    throw new Error(`devicePixelRatio must be positive, got ${devicePixelRatio}`);
  }
  return {
    x: Math.round(css.x * devicePixelRatio),
    y: Math.round(css.y * devicePixelRatio),
    width: Math.round(css.width * devicePixelRatio),
    height: Math.round(css.height * devicePixelRatio),
  };
}

const toCssRect = (r: Rect): CssRect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

const emptyReport = (): RedactionReport => ({
  maskedRegions: [],
  totalMasked: 0,
  postCaptureRecheck: "pass",
  recheckLeaks: [],
  recheckNotes: [],
});

/**
 * Run the full opt-in crop pipeline. See module doc for the contract. Returns a
 * result with `captured: false` (and no bytes) when opt-in is off or the
 * post-capture re-check detects a leak.
 */
export function captureScreenshotCrop(input: ScreenshotCaptureInput): ScreenshotCropResult {
  const captureRegion = toCssRect(input.request.targetBounds);
  const deviceRegion = scaleToDevice(captureRegion, input.request.devicePixelRatio);

  if (!input.optIn.enabled) {
    return {
      captured: false,
      abortReason: "opt-in-required",
      captureRegion,
      deviceRegion,
      redactionReport: emptyReport(),
    };
  }

  const preMasked: readonly RedactableRegion[] = discoverRedactableRegions(
    input.redaction.preCaptureCandidates(),
  );
  const maskDeviceRegions: readonly DeviceRect[] = preMasked.map((region) =>
    scaleToDevice(toCssRect(region.bounds), input.request.devicePixelRatio),
  );

  input.overlay.suppress();
  let captured: { readonly bytes: Uint8Array; readonly contentHash: string };
  try {
    captured = input.capture.captureMaskedDeviceRegion(deviceRegion, maskDeviceRegions);
  } finally {
    input.overlay.restore();
  }

  const recheck = recheckCapture(preMasked, input.redaction.postCaptureCandidates());
  const report = buildRedactionReport(preMasked, recheck);

  if (recheck.verdict === "fail") {
    // A late-rendered value or overlay may have leaked into the image before
    // the mask was painted. Discard the bytes; the report explains why.
    return {
      captured: false,
      abortReason: "post-capture-recheck-failed",
      captureRegion,
      deviceRegion,
      redactionReport: report,
    };
  }

  return {
    captured: true,
    captureRegion,
    deviceRegion,
    bytes: captured.bytes,
    contentHash: captured.contentHash,
    redactionReport: report,
  };
}

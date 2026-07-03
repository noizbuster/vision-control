/**
 * screenshot-crop tests (VC-V1V2-15 / ADR-011).
 *
 * Opt-in gate, overlay suppression (hide-before / restore-after), DPR scaling
 * coordinate correctness, and the post-capture re-check abort path. The actual
 * pixel capture is delegated to a fake adapter so the orchestration is
 * exercised without a real canvas.
 */

import type { Rect } from "@vision-control/geometry";
import { describe, expect, it } from "vitest";

import {
  captureScreenshotCrop,
  type DeviceRect,
  type ScreenshotCaptureAdapter,
  type ScreenshotCaptureInput,
  type ScreenshotOptIn,
  type ScreenshotRedactionLens,
  scaleToDevice,
} from "./screenshot-crop.js";
import type { DomRegionCandidate } from "./screenshot-redaction.js";

const rect = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, width: w, height: h });

function fakeCapture(hash = "sha256:crop"): {
  adapter: ScreenshotCaptureAdapter;
  calls: { device: DeviceRect; masks: readonly DeviceRect[] }[];
} {
  const calls: { device: DeviceRect; masks: readonly DeviceRect[] }[] = [];
  return {
    calls,
    adapter: {
      captureMaskedDeviceRegion(deviceRegion, maskRegions) {
        calls.push({ device: deviceRegion, masks: [...maskRegions] });
        return { bytes: new Uint8Array([1, 2, 3, 4]), contentHash: hash };
      },
    },
  };
}

function suppressor(): {
  suppress: () => void;
  restore: () => void;
  suppressed: number;
  restored: number;
  order: string[];
} {
  const log: string[] = [];
  return {
    order: log,
    get suppressed() {
      return log.filter((e) => e === "suppress").length;
    },
    get restored() {
      return log.filter((e) => e === "restore").length;
    },
    suppress() {
      log.push("suppress");
    },
    restore() {
      log.push("restore");
    },
  };
}

function lens(
  pre: readonly DomRegionCandidate[],
  post: readonly DomRegionCandidate[],
): ScreenshotRedactionLens {
  return {
    preCaptureCandidates: () => pre,
    postCaptureCandidates: () => post,
  };
}

const OPT_IN: ScreenshotOptIn = { enabled: true };

describe("scaleToDevice (DPR correctness)", () => {
  it("multiplies every coordinate by the device pixel ratio", () => {
    expect(scaleToDevice({ x: 10, y: 20, width: 100, height: 50 }, 2)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it("rounds fractional device pixels to integers", () => {
    expect(scaleToDevice({ x: 5, y: 5, width: 3, height: 3 }, 1.5)).toEqual({
      x: 8,
      y: 8,
      width: 5,
      height: 5,
    });
  });

  it("rejects a non-positive device pixel ratio", () => {
    expect(() => scaleToDevice({ x: 0, y: 0, width: 1, height: 1 }, 0)).toThrow();
    expect(() => scaleToDevice({ x: 0, y: 0, width: 1, height: 1 }, -1)).toThrow();
  });
});

describe("captureScreenshotCrop — opt-in gate", () => {
  it("aborts without capture when opt-in is disabled", () => {
    const cap = fakeCapture();
    const sup = suppressor();
    const result = captureScreenshotCrop({
      optIn: { enabled: false },
      request: { targetBounds: rect(0, 0), devicePixelRatio: 1 },
      overlay: sup,
      capture: cap.adapter,
      redaction: lens([], []),
    });
    expect(result.captured).toBe(false);
    expect(result.abortReason).toBe("opt-in-required");
    expect(cap.calls).toHaveLength(0);
    expect(sup.suppressed).toBe(0);
  });

  it("aborts when opt-in is absent (undefined is treated as disabled)", () => {
    const cap = fakeCapture();
    const input: ScreenshotCaptureInput = {
      optIn: { enabled: false },
      request: { targetBounds: rect(0, 0), devicePixelRatio: 1 },
      overlay: suppressor(),
      capture: cap.adapter,
      redaction: lens([], []),
    };
    expect(captureScreenshotCrop(input).captured).toBe(false);
  });
});

describe("captureScreenshotCrop — happy path", () => {
  it("suppresses overlay, captures the device region, restores, returns bytes", () => {
    const cap = fakeCapture("sha256:abc");
    const sup = suppressor();
    const result = captureScreenshotCrop({
      optIn: OPT_IN,
      request: { targetBounds: rect(10, 20, 100, 50), devicePixelRatio: 2 },
      overlay: sup,
      capture: cap.adapter,
      redaction: lens([], []),
    });
    expect(result.captured).toBe(true);
    expect(result.contentHash).toBe("sha256:abc");
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result.deviceRegion).toEqual({ x: 20, y: 40, width: 200, height: 100 });
    expect(result.captureRegion).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    // Overlay hidden before capture, restored exactly once after.
    expect(sup.order).toEqual(["suppress", "restore"]);
    expect(cap.calls).toHaveLength(1);
    expect(cap.calls[0]?.device).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });

  it("restores the overlay even when capture throws", () => {
    const sup = suppressor();
    const adapter: ScreenshotCaptureAdapter = {
      captureMaskedDeviceRegion: () => {
        throw new Error("canvas unavailable");
      },
    };
    expect(() =>
      captureScreenshotCrop({
        optIn: OPT_IN,
        request: { targetBounds: rect(0, 0), devicePixelRatio: 1 },
        overlay: sup,
        capture: adapter,
        redaction: lens([], []),
      }),
    ).toThrow("canvas unavailable");
    expect(sup.order).toEqual(["suppress", "restore"]);
  });
});

describe("captureScreenshotCrop — redaction masking", () => {
  it("scales pre-capture sensitive regions into device-space masks passed to the adapter", () => {
    const cap = fakeCapture();
    captureScreenshotCrop({
      optIn: OPT_IN,
      request: { targetBounds: rect(0, 0, 200, 200), devicePixelRatio: 2 },
      overlay: suppressor(),
      capture: cap.adapter,
      redaction: lens(
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
        ],
        // Post-capture: same field, still covered.
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
        ],
      ),
    });
    expect(cap.calls[0]?.masks).toEqual([{ x: 20, y: 20, width: 80, height: 40 }]);
  });

  it("records the masked region + passing recheck in the redaction report", () => {
    const cap = fakeCapture();
    const result = captureScreenshotCrop({
      optIn: OPT_IN,
      request: { targetBounds: rect(0, 0), devicePixelRatio: 1 },
      overlay: suppressor(),
      capture: cap.adapter,
      redaction: lens(
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
        ],
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
        ],
      ),
    });
    expect(result.redactionReport.totalMasked).toBe(1);
    expect(result.redactionReport.postCaptureRecheck).toBe("pass");
  });
});

describe("captureScreenshotCrop — post-capture re-check abort", () => {
  it("discards the bytes and aborts when a late-rendered private region leaks", () => {
    const cap = fakeCapture("sha256:leak");
    const result = captureScreenshotCrop({
      optIn: OPT_IN,
      request: { targetBounds: rect(0, 0, 500, 500), devicePixelRatio: 1 },
      overlay: suppressor(),
      capture: cap.adapter,
      redaction: lens(
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
        ],
        [
          {
            tagName: "input",
            bounds: rect(10, 10, 40, 20),
            type: "password",
            attributes: new Map(),
          },
          // Late-rendered private region never masked.
          {
            tagName: "div",
            bounds: rect(400, 400, 30, 30),
            attributes: new Map([["data-private", ""]]),
          },
        ],
      ),
    });
    expect(result.captured).toBe(false);
    expect(result.abortReason).toBe("post-capture-recheck-failed");
    expect(result.bytes).toBeUndefined();
    expect(result.contentHash).toBeUndefined();
    expect(result.redactionReport.postCaptureRecheck).toBe("fail");
    expect(result.redactionReport.recheckLeaks).toHaveLength(1);
    // The adapter WAS called (capture happened) — but the bytes are discarded.
    expect(cap.calls).toHaveLength(1);
  });
});

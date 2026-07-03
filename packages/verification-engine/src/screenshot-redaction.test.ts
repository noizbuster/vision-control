/**
 * screenshot-redaction tests (VC-V1V2-15 / ADR-011).
 *
 * Pre-capture discovery classifies `[data-private]`, credential inputs, and
 * hidden auth tokens. Post-capture re-check catches overlay/late-rendered
 * values that slipped past the pre-mask set (the misleading-success-output
 * defense: a value that appears between scan and capture fails the re-check).
 */

import type { Rect } from "@vision-control/geometry";
import { describe, expect, it } from "vitest";

import {
  buildRedactionReport,
  classifyRegion,
  type DomRegionCandidate,
  discoverRedactableRegions,
  recheckCapture,
} from "./screenshot-redaction.js";

const rect = (x: number, y: number, w = 10, h = 10): Rect => ({ x, y, width: w, height: h });

const attrs = (entries: ReadonlyArray<readonly [string, string]>): Map<string, string> =>
  new Map(entries);

function candidate(
  tagName: string,
  bounds: Rect,
  extra: Partial<Omit<DomRegionCandidate, "tagName" | "bounds" | "attributes">> & {
    attributes?: ReadonlyArray<readonly [string, string]>;
  } = {},
): DomRegionCandidate {
  return {
    tagName,
    bounds,
    attributes: attrs(extra.attributes ?? []),
    ...(extra.type !== undefined ? { type: extra.type } : {}),
    ...(extra.name !== undefined ? { name: extra.name } : {}),
    ...(extra.autocomplete !== undefined ? { autocomplete: extra.autocomplete } : {}),
  };
}

describe("classifyRegion", () => {
  it("flags [data-private] elements", () => {
    expect(
      classifyRegion(candidate("div", rect(0, 0), { attributes: [["data-private", ""]] })),
    ).toBe("data-private");
  });

  it("flags [data-private-token] as hidden-token", () => {
    expect(
      classifyRegion(candidate("span", rect(0, 0), { attributes: [["data-private-token", ""]] })),
    ).toBe("hidden-token");
  });

  it("flags password inputs as credential-field", () => {
    expect(classifyRegion(candidate("input", rect(1, 1), { type: "password" }))).toBe(
      "credential-field",
    );
  });

  it("flags text inputs whose name matches a credential pattern", () => {
    expect(
      classifyRegion(candidate("input", rect(1, 1), { type: "text", name: "userPassword" })),
    ).toBe("credential-field");
    expect(classifyRegion(candidate("input", rect(1, 1), { type: "text", name: "passwd" }))).toBe(
      "credential-field",
    );
    expect(classifyRegion(candidate("input", rect(1, 1), { type: "text", name: "secret" }))).toBe(
      "credential-field",
    );
  });

  it("flags credit-card inputs via autocomplete cc- token", () => {
    expect(
      classifyRegion(candidate("input", rect(1, 1), { type: "text", autocomplete: "cc-number" })),
    ).toBe("credential-field");
    expect(
      classifyRegion(candidate("input", rect(1, 1), { type: "text", autocomplete: "cc-csc" })),
    ).toBe("credential-field");
  });

  it("flags current/new-password autocomplete tokens", () => {
    expect(
      classifyRegion(candidate("input", rect(1, 1), { autocomplete: "current-password" })),
    ).toBe("credential-field");
  });

  it("flags hidden inputs whose name matches a token pattern", () => {
    expect(
      classifyRegion(
        candidate("input", rect(2, 2), { type: "hidden", name: "authenticity_token" }),
      ),
    ).toBe("hidden-token");
    expect(classifyRegion(candidate("input", rect(2, 2), { type: "hidden", name: "csrf" }))).toBe(
      "hidden-token",
    );
    expect(
      classifyRegion(candidate("input", rect(2, 2), { type: "hidden", name: "authToken" })),
    ).toBe("hidden-token");
  });

  it("does NOT flag an ordinary text input", () => {
    expect(classifyRegion(candidate("input", rect(3, 3), { type: "text", name: "username" }))).toBe(
      undefined,
    );
  });

  it("does NOT flag a hidden input with a benign name", () => {
    expect(
      classifyRegion(candidate("input", rect(3, 3), { type: "hidden", name: "tabIndex" })),
    ).toBe(undefined);
  });

  it("does not treat a non-input element with a credential-ish name as sensitive", () => {
    expect(classifyRegion(candidate("div", rect(4, 4), { name: "passwordHint" }))).toBe(undefined);
  });
});

describe("discoverRedactableRegions", () => {
  it("collects every sensitive region and assigns stable ids", () => {
    const regions = discoverRedactableRegions([
      candidate("div", rect(0, 0), { attributes: [["data-private", ""]] }),
      candidate("input", rect(10, 10), { type: "password" }),
      candidate("input", rect(20, 20), { type: "text", name: "username" }),
      candidate("input", rect(30, 30), { type: "hidden", name: "csrf" }),
    ]);
    expect(regions.map((r) => r.reason)).toEqual([
      "data-private",
      "credential-field",
      "hidden-token",
    ]);
    expect(regions.map((r) => r.id)).toEqual(["redact-1", "redact-2", "redact-3"]);
  });

  it("returns an empty array when nothing is sensitive", () => {
    expect(discoverRedactableRegions([candidate("div", rect(0, 0))])).toEqual([]);
  });
});

describe("recheckCapture (post-capture re-check)", () => {
  it("passes when the post-capture sensitive set is covered by pre-masked regions", () => {
    const preMasked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    const post = recheckCapture(preMasked, [
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    expect(post.verdict).toBe("pass");
    expect(post.leaks).toEqual([]);
  });

  it("FAILS when a late-rendered [data-private] region appears that was not pre-masked", () => {
    const preMasked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    // A brand-new private region at a DIFFERENT location — was never masked.
    const post = recheckCapture(preMasked, [
      candidate("input", rect(10, 10), { type: "password" }),
      candidate("div", rect(200, 200), { attributes: [["data-private", ""]] }),
    ]);
    expect(post.verdict).toBe("fail");
    expect(post.leaks).toHaveLength(1);
    expect(post.leaks[0]?.reason).toBe("data-private");
    expect(post.notes[0]).toContain("data-private");
  });

  it("FAILS when a credential field shifts to an unmasked location (overlay/value moved)", () => {
    const preMasked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    // Same field kind, but the bounds moved away from the mask.
    const post = recheckCapture(preMasked, [
      candidate("input", rect(500, 500), { type: "password" }),
    ]);
    expect(post.verdict).toBe("fail");
    expect(post.leaks[0]?.reason).toBe("credential-field");
  });

  it("passes when a post-capture sensitive region still overlaps its mask", () => {
    const preMasked = discoverRedactableRegions([
      candidate("input", rect(10, 10, 40, 20), { type: "password" }),
    ]);
    // Field nudged but still within the masked rectangle — covered.
    const post = recheckCapture(preMasked, [
      candidate("input", rect(12, 12, 40, 20), { type: "password" }),
    ]);
    expect(post.verdict).toBe("pass");
  });

  it("passes when the post-capture DOM has nothing sensitive", () => {
    const preMasked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    const post = recheckCapture(preMasked, [candidate("div", rect(0, 0))]);
    expect(post.verdict).toBe("pass");
  });
});

describe("buildRedactionReport", () => {
  it("summarizes masked count + recheck verdict", () => {
    const masked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    const report = buildRedactionReport(masked, recheckCapture(masked, []));
    expect(report.totalMasked).toBe(1);
    expect(report.postCaptureRecheck).toBe("pass");
    expect(report.recheckLeaks).toEqual([]);
  });

  it("carries leaks + notes through on a failed recheck", () => {
    const masked = discoverRedactableRegions([
      candidate("input", rect(10, 10), { type: "password" }),
    ]);
    const report = buildRedactionReport(
      masked,
      recheckCapture(masked, [candidate("input", rect(999, 999), { type: "password" })]),
    );
    expect(report.postCaptureRecheck).toBe("fail");
    expect(report.recheckLeaks).toHaveLength(1);
    expect(report.recheckNotes[0]).toContain("credential-field");
  });
});

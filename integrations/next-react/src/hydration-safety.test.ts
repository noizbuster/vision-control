import { describe, expect, it } from "vitest";

import { assertHydrationSafe, extractMarkers, isMarkerDeterministic } from "./hydration-safety.js";

describe("hydration-safety", () => {
  describe("extractMarkers", () => {
    it("extracts data-vc-source values in document order", () => {
      const html = '<div data-vc-source="abc123"><span data-vc-source="def456">hi</span></div>';
      expect(extractMarkers(html)).toEqual(["abc123", "def456"]);
    });

    it("returns empty array when no markers present", () => {
      expect(extractMarkers("<div><p>no markers</p></div>")).toEqual([]);
    });

    it("handles empty marker values", () => {
      expect(extractMarkers('<div data-vc-source=""></div>')).toEqual([""]);
    });
  });

  describe("assertHydrationSafe", () => {
    it("passes when server and client markers match exactly", () => {
      const server = '<div data-vc-source="aaa"><span data-vc-source="bbb"></span></div>';
      const client = '<div data-vc-source="aaa"><span data-vc-source="bbb"></span></div>';
      const result = assertHydrationSafe({ serverHtml: server, clientHtml: client });
      expect(result.safe).toBe(true);
      expect(result.mismatchedAttributes).toEqual([]);
    });

    it("passes when both sides have zero markers", () => {
      const result = assertHydrationSafe({
        serverHtml: "<div>clean</div>",
        clientHtml: "<div>clean</div>",
      });
      expect(result.safe).toBe(true);
    });

    it("fails when marker count differs", () => {
      const result = assertHydrationSafe({
        serverHtml: '<div data-vc-source="aaa"></div>',
        clientHtml: "<div></div>",
      });
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("count mismatch");
    });

    it("fails when marker values differ", () => {
      const result = assertHydrationSafe({
        serverHtml: '<div data-vc-source="aaa"></div>',
        clientHtml: '<div data-vc-source="bbb"></div>',
      });
      expect(result.safe).toBe(false);
      expect(result.mismatchedAttributes.length).toBe(1);
      expect(result.reason).toContain("differ");
    });

    it("fails when marker order differs", () => {
      const result = assertHydrationSafe({
        serverHtml: '<div data-vc-source="aaa"><span data-vc-source="bbb"></span></div>',
        clientHtml: '<div data-vc-source="bbb"><span data-vc-source="aaa"></span></div>',
      });
      expect(result.safe).toBe(false);
      expect(result.mismatchedAttributes.length).toBe(2);
    });
  });

  describe("isMarkerDeterministic", () => {
    it("returns true for identical render sequences", () => {
      expect(isMarkerDeterministic(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
    });

    it("returns false for different sequences", () => {
      expect(isMarkerDeterministic(["a", "b"], ["a", "c"])).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(isMarkerDeterministic(["a", "b"], ["a"])).toBe(false);
    });

    it("returns true for two empty sequences", () => {
      expect(isMarkerDeterministic([], [])).toBe(true);
    });
  });
});

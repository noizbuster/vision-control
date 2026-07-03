import { describe, expect, it } from "vitest";

import { detectTurbopack, turbopackWarning } from "./turbopack-diagnostic.js";

describe("turbopack-diagnostic", () => {
  describe("detectTurbopack", () => {
    it("returns not-detected when no signal present", () => {
      const result = detectTurbopack({ env: {}, argv: [] });
      expect(result.detected).toBe(false);
      expect(result.diagnostic).toBe("");
    });

    it("detects TURBOPACK env var", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "1" }, argv: [] });
      expect(result.detected).toBe(true);
      expect(result.reason).toContain("TURBOPACK");
    });

    it("detects NEXT_PRIVATE_TURBOPACK env var", () => {
      const result = detectTurbopack({ env: { NEXT_PRIVATE_TURBOPACK: "true" }, argv: [] });
      expect(result.detected).toBe(true);
    });

    it("detects TURBO env var (next dev --turbo alias)", () => {
      const result = detectTurbopack({ env: { TURBO: "1" }, argv: [] });
      expect(result.detected).toBe(true);
    });

    it("ignores falsy env values", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "0" }, argv: [] });
      expect(result.detected).toBe(false);
    });

    it("ignores undefined env values", () => {
      const result = detectTurbopack({ env: { TURBOPACK: undefined }, argv: [] });
      expect(result.detected).toBe(false);
    });

    it("detects experimental.turbopack in next.config", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { experimental: { turbopack: { rules: {} } } },
      });
      expect(result.detected).toBe(true);
      expect(result.reason).toContain("experimental.turbopack");
    });

    it("ignores experimental.turbopack when absent", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { experimental: {} },
      });
      expect(result.detected).toBe(false);
    });

    it("detects --turbopack CLI flag", () => {
      const result = detectTurbopack({ env: {}, argv: ["node", "next", "dev", "--turbopack"] });
      expect(result.detected).toBe(true);
      expect(result.reason).toContain("--turbopack");
    });

    it("detects --turbo CLI flag alias", () => {
      const result = detectTurbopack({ env: {}, argv: ["next", "dev", "--turbo"] });
      expect(result.detected).toBe(true);
    });

    it("diagnostic message mentions V1 limitation and V2+ track", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "1" }, argv: [] });
      expect(result.diagnostic).toContain("not yet supported");
      expect(result.diagnostic).toContain("webpack/Babel");
      expect(result.diagnostic).toContain("V2+");
    });
  });

  describe("turbopackWarning", () => {
    it("returns the diagnostic when Turbopack detected", () => {
      const warning = turbopackWarning({ env: { TURBOPACK: "1" }, argv: [] });
      expect(warning).toBeDefined();
      expect(typeof warning).toBe("string");
    });

    it("returns undefined when webpack/Babel active", () => {
      const warning = turbopackWarning({ env: {}, argv: [] });
      expect(warning).toBeUndefined();
    });
  });

  describe("malformed input (graceful degradation)", () => {
    it("handles missing nextConfig gracefully", () => {
      const result = detectTurbopack({ env: {} });
      expect(result.detected).toBe(false);
    });

    it("handles empty argv", () => {
      const result = detectTurbopack({ env: {}, argv: [] });
      expect(result.detected).toBe(false);
    });

    it("handles null experimental.turbopack as not-detected", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { experimental: { turbopack: null } },
      });
      expect(result.detected).toBe(false);
    });
  });
});

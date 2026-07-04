import { describe, expect, it } from "vitest";

import { detectTurbopack, turbopackWarning } from "./turbopack-diagnostic.js";

const WIRED_CONFIG = {
  turbopack: {
    rules: {
      "*.tsx": { loaders: [{ loader: "/abs/loader.js", options: {} }] },
      "*.jsx": { loaders: [{ loader: "/abs/loader.js", options: {} }] },
    },
  },
};

describe("turbopack-diagnostic", () => {
  describe("detectTurbopack — not detected", () => {
    it("returns not-detected when no signal present", () => {
      const result = detectTurbopack({ env: {}, argv: [] });
      expect(result.detected).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.diagnostic).toBe("");
    });

    it("ignores falsy env values", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "0" }, argv: [] });
      expect(result.detected).toBe(false);
    });

    it("ignores undefined env values", () => {
      const result = detectTurbopack({ env: { TURBOPACK: undefined }, argv: [] });
      expect(result.detected).toBe(false);
    });

    it("ignores experimental.turbopack when absent", () => {
      const result = detectTurbopack({ env: {}, argv: [], nextConfig: { experimental: {} } });
      expect(result.detected).toBe(false);
    });
  });

  describe("detectTurbopack — detected, marker rule NOT wired (advisory)", () => {
    it("detects TURBOPACK env var", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "1" }, argv: [] });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(false);
      expect(result.reason).toContain("TURBOPACK");
      expect(result.diagnostic).toContain("marker rule is not wired");
    });

    it("detects NEXT_PRIVATE_TURBOPACK env var", () => {
      const result = detectTurbopack({ env: { NEXT_PRIVATE_TURBOPACK: "true" }, argv: [] });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(false);
    });

    it("detects TURBO env var (next dev --turbo alias)", () => {
      const result = detectTurbopack({ env: { TURBO: "1" }, argv: [] });
      expect(result.detected).toBe(true);
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

    it("detects --turbopack CLI flag", () => {
      const result = detectTurbopack({ env: {}, argv: ["node", "next", "dev", "--turbopack"] });
      expect(result.detected).toBe(true);
      expect(result.reason).toContain("--turbopack");
    });

    it("detects --turbo CLI flag alias", () => {
      const result = detectTurbopack({ env: {}, argv: ["next", "dev", "--turbo"] });
      expect(result.detected).toBe(true);
    });

    it("advisory diagnostic mentions the rule is not wired and ADR-008", () => {
      const result = detectTurbopack({ env: { TURBOPACK: "1" }, argv: [] });
      expect(result.diagnostic).toContain("not wired");
      expect(result.diagnostic).toContain("ADR-008");
    });
  });

  describe("detectTurbopack — detected, marker rule wired (success)", () => {
    it("emits supported=true when turbopack.rules has *.tsx marker rule", () => {
      const result = detectTurbopack({
        env: { TURBOPACK: "1" },
        argv: [],
        nextConfig: WIRED_CONFIG,
      });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(true);
      expect(result.diagnostic).toContain("markers are wired");
    });

    it("success message mentions dev injection + production gate", () => {
      const result = detectTurbopack({
        env: { TURBOPACK: "1" },
        argv: [],
        nextConfig: WIRED_CONFIG,
      });
      expect(result.diagnostic).toContain("next dev --turbo");
      expect(result.diagnostic).toContain("isNextProduction");
      expect(result.diagnostic).toContain("ADR-008");
    });

    it("emits success when detected via top-level turbopack field with rules", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { turbopack: { rules: { "*.tsx": { loaders: [] } } } },
      });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(true);
    });

    it("emits success when only *.jsx rule is present", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { turbopack: { rules: { "*.jsx": { loaders: [] } } } },
      });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(true);
    });

    it("emits advisory when turbopack field set but no *.tsx/*.jsx rule", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { turbopack: { rules: { "*.svg": { loaders: [] } } } },
      });
      expect(result.detected).toBe(true);
      expect(result.supported).toBe(false);
    });
  });

  describe("turbopackWarning", () => {
    it("returns undefined when webpack/Babel active", () => {
      expect(turbopackWarning({ env: {}, argv: [] })).toBeUndefined();
    });

    it("returns undefined when Turbopack active and markers wired (success)", () => {
      expect(
        turbopackWarning({ env: { TURBOPACK: "1" }, argv: [], nextConfig: WIRED_CONFIG }),
      ).toBeUndefined();
    });

    it("returns the advisory when Turbopack active but markers NOT wired", () => {
      const warning = turbopackWarning({ env: { TURBOPACK: "1" }, argv: [] });
      expect(warning).toBeDefined();
      expect(typeof warning).toBe("string");
      expect(warning).toContain("not wired");
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

    it("handles null top-level turbopack as not-detected", () => {
      const result = detectTurbopack({
        env: {},
        argv: [],
        nextConfig: { turbopack: null },
      });
      expect(result.detected).toBe(false);
    });
  });
});

/**
 * Tests for CSS Modules composition tracing (VC-V1V2-12, TDD-first).
 */
import { describe, expect, it } from "vitest";

import { traceComposition } from "./composition.js";
import { parseManifest } from "./manifest.js";

describe("traceComposition — no composition", () => {
  it("returns a single candidate for a class with no composes", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    const result = traceComposition("_button_ab12cd", manifest);
    expect(result).toHaveLength(1);
    expect(result[0]?.localName).toBe("button");
    expect(result[0]?.isComposedTarget).toBe(false);
  });

  it("returns empty for a hash not in the manifest", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    expect(traceComposition("_nonexistent_xyz", manifest)).toEqual([]);
  });
});

describe("traceComposition — with composes", () => {
  it("traces a single compose target to produce two candidates", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        base: "_base_1a2b",
        button: "_base_1a2b _button_3c4d",
      },
    });
    const result = traceComposition("_button_3c4d", manifest);
    // _button_3c4d maps to the "button" entry which has composedHashes
    // ["_base_1a2b", "_button_3c4d"]. The primary is "button", compose target
    // is "base" (via _base_1a2b).
    expect(result.length).toBeGreaterThanOrEqual(1);
    const primary = result.find((c) => !c.isComposedTarget);
    expect(primary?.localName).toBe("button");
    const composed = result.find((c) => c.isComposedTarget);
    expect(composed).toBeDefined();
    expect(composed?.localName).toBe("base");
  });

  it("traces cross-module composition (composes from ./other)", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        button: "_common_111 _button_222",
      },
      "src/shared.module.css": {
        common: "_common_111",
      },
    });
    const result = traceComposition("_button_222", manifest);
    const composed = result.find((c) => c.isComposedTarget);
    expect(composed?.modulePath).toBe("src/shared.module.css");
    expect(composed?.localName).toBe("common");
  });

  it("handles three-way composition", () => {
    const manifest = parseManifest({
      "src/Card.module.css": {
        card: "_a_111 _b_222 _c_333",
      },
      "src/A.module.css": { a: "_a_111" },
      "src/B.module.css": { b: "_b_222" },
      "src/C.module.css": { c: "_c_333" },
    });
    const result = traceComposition("_a_111", manifest);
    // _a_111 maps to "card" entry (which has 3 composedHashes) AND to "a" entry.
    const localNames = result.map((c) => c.localName).sort();
    expect(localNames).toEqual(expect.arrayContaining(["a", "b", "c", "card"]));
  });

  it("guards against circular compose chains", () => {
    // Simulate: A composes B, B composes A (both in same module value)
    const manifest = parseManifest({
      "src/Loop.module.css": {
        a: "_a_111 _b_222",
        b: "_a_111 _b_222",
      },
    });
    const result = traceComposition("_a_111", manifest);
    // Should not loop infinitely; should produce distinct candidates.
    const keys = new Set(result.map((c) => `${c.modulePath}:${c.localName}`));
    expect(keys.size).toBe(result.length);
  });
});

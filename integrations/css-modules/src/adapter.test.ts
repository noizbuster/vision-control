/**
 * Tests for the CSS Modules adapter (VC-V1V2-12, TDD-first).
 *
 * Demonstrates the three confidence tiers:
 * - Manifest + source-map + range → HIGH (never-wrong-HIGH compliant).
 * - Manifest alone → MEDIUM.
 * - Hash heuristic only → MEDIUM/LOW with "agent-required" warning.
 * Plus composition tracing producing multiple candidates.
 */
import { describe, expect, it } from "vitest";

import { CSS_MODULES_ADAPTER, createCssModulesAdapter } from "./adapter.js";
import { parseManifest } from "./manifest.js";
import { type CssSourceMap, parseSourceMap } from "./source-map.js";

const ctxWith = (...cssClasses: string[]) => ({ cssClasses });

const mustSourceMap = (input: unknown): CssSourceMap => {
  const sm = parseSourceMap(input);
  if (sm === undefined) throw new Error("test fixture produced an invalid source map");
  return sm;
};

describe("CSS_MODULES_ADAPTER singleton (no data loaded)", () => {
  it("returns a MEDIUM heuristic candidate for a css-loader underscore hash", () => {
    const candidates = CSS_MODULES_ADAPTER.resolve(ctxWith("_button_ab12cd"));
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c).toBeDefined();
    expect(c?.confidence).toBe("medium");
    expect(c?.confidence).not.toBe("high");
    expect(c?.evidence).toEqual(["text-search"]);
    expect(c?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
    expect(c?.warnings.some((w) => w.includes("inferred local name"))).toBe(true);
    expect(c?.ownershipRisk).toBe("medium");
  });

  it("returns a MEDIUM heuristic candidate for a namespaced css-loader hash", () => {
    const candidates = CSS_MODULES_ADAPTER.resolve(ctxWith("Button_root__1a2b3c"));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("medium");
    expect(candidates[0]?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
  });

  it("returns an empty array for a non-hashed class name", () => {
    expect(CSS_MODULES_ADAPTER.resolve(ctxWith("btn"))).toEqual([]);
    expect(CSS_MODULES_ADAPTER.resolve(ctxWith("button-large"))).toEqual([]);
  });

  it("returns an empty array when no cssClasses are provided", () => {
    expect(CSS_MODULES_ADAPTER.resolve({})).toEqual([]);
    expect(CSS_MODULES_ADAPTER.resolve({ cssClasses: [] })).toEqual([]);
  });

  it("produces candidates for multiple hashed classes on one element", () => {
    const candidates = CSS_MODULES_ADAPTER.resolve(ctxWith("_button_ab12cd", "_card_ef4567"));
    expect(candidates).toHaveLength(2);
  });
});

describe("createCssModulesAdapter — manifest-backed (HIGH)", () => {
  it("produces a HIGH candidate when manifest + source-map + range are available", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    const sourceMaps = new Map([
      [
        "src/Button.module.css",
        mustSourceMap({
          version: 3,
          sources: ["src/Button.module.css"],
          sourcesContent: [".button {\n  color: red;\n}"],
          mappings: "AAAA",
          names: [],
        }),
      ],
    ]);
    const adapter = createCssModulesAdapter({ manifest, sourceMaps });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.confidence).toBe("high");
    expect(c?.evidence).toEqual(expect.arrayContaining(["manifest", "source-map"]));
    expect(c?.workspaceRelativePath).toBe("src/Button.module.css");
    expect(c?.startLine).toBe(0);
    expect(c?.endLine).toBe(0);
    expect(c?.cssFilePath).toBe("src/Button.module.css");
    expect(c?.staticClassName).toBe("_button_ab12cd");
    expect(c?.ownershipRisk).toBe("low");
  });

  it("uses basename fallback when the source-map key does not match the manifest path exactly", () => {
    const manifest = parseManifest({
      "/abs/path/src/Button.module.css": { button: "_button_ab12cd" },
    });
    const sourceMaps = new Map([
      [
        "Button.module.css",
        mustSourceMap({
          version: 3,
          sources: ["Button.module.css"],
          sourcesContent: [".button {\n  display: flex;\n}"],
          mappings: "AAAA",
          names: [],
        }),
      ],
    ]);
    const adapter = createCssModulesAdapter({ manifest, sourceMaps });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));
    expect(candidates[0]?.confidence).toBe("high");
  });
});

describe("createCssModulesAdapter — manifest without source map (MEDIUM)", () => {
  it("produces a MEDIUM candidate when manifest is present but no source map", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    const adapter = createCssModulesAdapter({ manifest });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.confidence).toBe("medium");
    expect(c?.confidence).not.toBe("high");
    expect(c?.evidence).toEqual(["manifest"]);
    expect(c?.cssFilePath).toBe("src/Button.module.css");
  });

  it("produces a MEDIUM candidate when source map exists but class range is unresolved", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    const sourceMaps = new Map([
      [
        "src/Button.module.css",
        mustSourceMap({
          version: 3,
          sources: ["src/Button.module.css"],
          // No sourcesContent — range cannot be resolved.
          mappings: "AAAA",
          names: [],
        }),
      ],
    ]);
    const adapter = createCssModulesAdapter({ manifest, sourceMaps });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));

    expect(candidates[0]?.confidence).toBe("medium");
    expect(candidates[0]?.evidence).toEqual(expect.arrayContaining(["manifest", "source-map"]));
    expect(candidates[0]?.warnings.some((w) => w.includes("not resolved"))).toBe(true);
  });
});

describe("createCssModulesAdapter — composition tracing (multiple candidates)", () => {
  it("produces multiple candidates for a composed class", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        base: "_base_1a2b",
        button: "_base_1a2b _button_3c4d",
      },
    });
    const adapter = createCssModulesAdapter({ manifest });
    const candidates = adapter.resolve(ctxWith("_button_3c4d"));

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const primary = candidates.find((c) => !c.warnings.some((w) => w.includes("composed")));
    const composed = candidates.find((c) => c.warnings.some((w) => w.includes("composed")));
    expect(primary?.staticClassName).toBe("_button_3c4d");
    expect(composed?.staticClassName).toBe("_base_1a2b");
    expect(composed?.ownershipRisk).toBe("medium");
  });
});

describe("createCssModulesAdapter — malformed manifest (graceful degradation)", () => {
  it("falls back to heuristic when manifest is empty/malformed", () => {
    const manifest = parseManifest(null);
    const adapter = createCssModulesAdapter({ manifest });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("medium");
    expect(candidates[0]?.evidence).toEqual(["text-search"]);
    expect(candidates[0]?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
  });

  it("falls back to heuristic for an unknown hash when manifest has no match", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    const adapter = createCssModulesAdapter({ manifest });
    const candidates = adapter.resolve(ctxWith("_card_unknown1"));

    // _card_unknown1 matches the underscore heuristic
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("medium");
    expect(candidates[0]?.evidence).toEqual(["text-search"]);
  });
});

describe("createCssModulesAdapter — stale manifest warning", () => {
  it("includes a stale-state diagnostic when the manifest is empty but class looks hashed", () => {
    const manifest = parseManifest({});
    const adapter = createCssModulesAdapter({ manifest });
    const candidates = adapter.resolve(ctxWith("_button_ab12cd"));

    // Empty manifest → heuristic fallback. The warning should mention the
    // missing manifest, signalling possible staleness.
    expect(candidates[0]?.warnings.some((w) => w.includes("no manifest"))).toBe(true);
  });
});

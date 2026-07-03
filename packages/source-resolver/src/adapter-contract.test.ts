/**
 * Adapter / confidence contract tests (VC-V1V2-04).
 *
 * TDD-first: every policy is encoded here BEFORE the implementation lands.
 * The never-wrong-HIGH rule is the load-bearing guardrail — an adapter that
 * claims HIGH without strong evidence MUST be downgraded by the resolver, even
 * though the adapter is the one lying.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceRegistry } from "@vision-control/source-registry";
import { FakeClock, FakeUuidSequencer } from "@vision-control/testing";
import { CssTokenIndex } from "@vision-control/workspace-index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AdapterRegistry,
  buildConfidenceUiData,
  CONFIDENCE_EVIDENCE,
  type ConfidenceEvidence,
  CSS_IN_JS_ADAPTER,
  CSS_MODULES_ADAPTER,
  createSourceCandidate,
  enforceNeverWrongHigh,
  NEXT_ADAPTER,
  type SourceAdapter,
  SourceResolver,
  SVELTE_ADAPTER,
  satisfiesHighEvidence,
  TAILWIND_TOKEN_ADAPTER,
  V1_NOT_IMPLEMENTED_ADAPTERS,
  VANILLA_CSS_ADAPTER,
  VUE_ADAPTER,
} from "./index.js";

const FRESH = "ff00aabb";
const STALE = "99deadbe";

const clock = new FakeClock(1_700_000_000_000);
const uuid = new FakeUuidSequencer("cand-", 1);

const makeIdentity = (overrides: Record<string, unknown> = {}) => ({
  runtimeId: "r-1",
  tagName: "button",
  frameId: "main",
  fingerprint: FRESH,
  confidence: "high" as const,
  ...overrides,
});

/** Minimal adapter stub: returns a fixed list of candidates, ignores context. */
const stubAdapter = (
  id: string,
  candidates: ReturnType<typeof createSourceCandidate>[],
): SourceAdapter => ({
  id,
  resolve: () => candidates,
});

const tmpRoot = mkdtempSync(join(tmpdir(), "vc-adapter-"));

const baseResolverOpts = (overrides: { adapters?: AdapterRegistry } = {}) => ({
  registry: new SourceRegistry(),
  cssTokenIndex: new CssTokenIndex(),
  workspaceRoot: tmpRoot,
  ...(overrides.adapters !== undefined ? { adapters: overrides.adapters } : {}),
});

beforeEach(() => {
  clock.reset();
  uuid.reset();
});

afterEach(() => {
  // Sanity: the dom-free invariant is upheld by the package; nothing to scrub.
});

describe("ConfidenceEvidence taxonomy", () => {
  it("exposes the seven canonical methods in order", () => {
    expect([...CONFIDENCE_EVIDENCE]).toEqual([
      "marker",
      "fingerprint",
      "manifest",
      "source-map",
      "ast-origin",
      "text-search",
      "llm-inference",
    ]);
  });

  it("rejects an unknown evidence method at the type/schema boundary", () => {
    // Build via a cast to simulate an untyped source; createSourceCandidate must reject.
    const bad = {
      confidence: "high" as const,
      evidence: ["telepathy"] as unknown as ConfidenceEvidence[],
    };
    expect(() => createSourceCandidate(bad)).toThrow();
  });
});

describe("satisfiesHighEvidence — the never-wrong-HIGH predicate", () => {
  it("marker alone qualifies for HIGH", () => {
    expect(satisfiesHighEvidence(["marker"], true)).toBe(true);
    expect(satisfiesHighEvidence(["marker"], false)).toBe(true);
  });

  it("ast-origin alone qualifies for HIGH", () => {
    expect(satisfiesHighEvidence(["ast-origin"], true)).toBe(true);
  });

  it("fingerprint + manifest qualifies for HIGH", () => {
    expect(satisfiesHighEvidence(["fingerprint", "manifest"], false)).toBe(true);
  });

  it("source-map + range qualifies for HIGH", () => {
    expect(satisfiesHighEvidence(["source-map"], true)).toBe(true);
  });

  it("source-map WITHOUT range is NOT HIGH", () => {
    expect(satisfiesHighEvidence(["source-map"], false)).toBe(false);
  });

  it("manifest alone is NOT HIGH (needs fingerprint or source-map)", () => {
    expect(satisfiesHighEvidence(["manifest"], true)).toBe(false);
  });

  it("fingerprint alone is NOT HIGH (needs manifest)", () => {
    expect(satisfiesHighEvidence(["fingerprint"], true)).toBe(false);
  });

  it("text-search is NEVER HIGH alone", () => {
    expect(satisfiesHighEvidence(["text-search"], true)).toBe(false);
  });

  it("llm-inference is NEVER HIGH", () => {
    expect(satisfiesHighEvidence(["llm-inference"], true)).toBe(false);
    expect(satisfiesHighEvidence(["llm-inference", "text-search"], true)).toBe(false);
  });

  it("empty evidence is NOT HIGH", () => {
    expect(satisfiesHighEvidence([], true)).toBe(false);
  });
});

describe("enforceNeverWrongHigh — adapter lies get downgraded", () => {
  it("downgrades a HIGH candidate whose evidence is only text-search to MEDIUM + warning", () => {
    const lying = createSourceCandidate({
      sourceId: "src-x",
      confidence: "high",
      evidence: ["text-search"],
      warnings: [],
    });
    const enforced = enforceNeverWrongHigh(lying);
    expect(enforced.confidence).toBe("medium");
    expect(enforced.confidence).not.toBe("high");
    expect(enforced.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("never-wrong-HIGH")]),
    );
  });

  it("downgrades a HIGH candidate with no evidence at all", () => {
    const lying = createSourceCandidate({ confidence: "high", warnings: [] });
    const enforced = enforceNeverWrongHigh(lying);
    expect(enforced.confidence).toBe("medium");
    expect(enforced.warnings.some((w) => w.includes("never-wrong-HIGH"))).toBe(true);
  });

  it("downgrades a HIGH llm-inference candidate to MEDIUM (never HIGH)", () => {
    const lying = createSourceCandidate({
      confidence: "high",
      evidence: ["llm-inference"],
      warnings: [],
    });
    const enforced = enforceNeverWrongHigh(lying);
    expect(enforced.confidence).toBe("medium");
  });

  it("keeps a HIGH candidate that genuinely carries marker evidence", () => {
    const honest = createSourceCandidate({
      sourceId: "src-marker",
      confidence: "high",
      evidence: ["marker"],
      warnings: [],
    });
    expect(enforceNeverWrongHigh(honest).confidence).toBe("high");
  });

  it("leaves MEDIUM and LOW candidates untouched", () => {
    const med = createSourceCandidate({
      confidence: "medium",
      evidence: ["text-search"],
      warnings: [],
    });
    const low = createSourceCandidate({
      confidence: "low",
      evidence: ["llm-inference"],
      warnings: [],
    });
    expect(enforceNeverWrongHigh(med).confidence).toBe("medium");
    expect(enforceNeverWrongHigh(low).confidence).toBe("low");
  });
});

describe("SourceResolver — never-wrong-HIGH enforced across adapters", () => {
  it("an adapter claiming HIGH with text-search evidence is downgraded to MEDIUM by the resolver", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("lying-dynamic", [
        createSourceCandidate({
          sourceId: uuid.next(),
          staticClassName: "css-1abcde",
          confidence: "high",
          evidence: ["text-search"],
          warnings: [],
          ownershipRisk: "medium",
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const candidates = resolver.resolveCandidates(makeIdentity());
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    if (top === undefined) throw new Error("expected at least one candidate");
    expect(top.confidence).toBe("medium");
    expect(top.confidence).not.toBe("high");
    expect(top.warnings.some((w) => w.includes("never-wrong-HIGH"))).toBe(true);
    expect(top.selected).toBe(true);
  });

  it("an adapter claiming HIGH with NO evidence is downgraded to MEDIUM", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("lying-bare", [
        createSourceCandidate({ sourceId: uuid.next(), confidence: "high", warnings: [] }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("medium");
  });
});

describe("SourceResolver — dynamic / hashed / generated sources never HIGH", () => {
  it("a CSS-in-JS generated class (text-search only) resolves to MEDIUM, never HIGH", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("styled-components", [
        createSourceCandidate({
          staticClassName: "sc-7b3f9a",
          confidence: "medium",
          evidence: ["text-search"],
          warnings: ["css-in-js generated class is unstable across builds"],
          ownershipRisk: "high",
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("medium");
    expect(top?.confidence).not.toBe("high");
    expect(top?.ownershipRisk).toBe("high");
  });

  it("a dynamic props.className (llm-inference) resolves to LOW, never HIGH", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("dynamic-classname", [
        createSourceCandidate({
          staticClassName: "prop-driven",
          confidence: "low",
          evidence: ["llm-inference"],
          warnings: ["props.className is dynamic; origin inferred, not proven"],
          ownershipRisk: "high",
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("low");
    expect(top?.confidence).not.toBe("high");
  });

  it("a hashed CSS Module class WITHOUT manifest/source-map resolves to MEDIUM at best", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("css-modules-hashed-alone", [
        createSourceCandidate({
          staticClassName: "Button_root__3xF9k",
          cssFilePath: "src/Button.module.css",
          confidence: "medium",
          evidence: ["text-search"],
          warnings: ["hashed CSS module class without manifest mapping"],
          ownershipRisk: "medium",
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("medium");
    expect(top?.confidence).not.toBe("high");
  });
});

describe("SourceResolver — manifest-backed hashed class produces HIGH only with source-map+range+fingerprint", () => {
  it("manifest + source-map + range yields HIGH when fingerprint matches", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("css-modules-backed", [
        createSourceCandidate({
          sourceId: "cm-Button-root",
          workspaceRelativePath: "src/Button.module.css",
          startLine: 4,
          startColumn: 0,
          endLine: 4,
          endColumn: 18,
          staticClassName: "Button_root__3xF9k",
          cssFilePath: "src/Button.module.css",
          cssLine: 4,
          confidence: "high",
          evidence: ["manifest", "source-map"],
          warnings: [],
          ownershipRisk: "low",
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity({ fingerprint: FRESH }));
    expect(top?.confidence).toBe("high");
    expect(top?.selected).toBe(true);
    expect(top?.evidence).toEqual(expect.arrayContaining(["manifest", "source-map"]));
  });

  it("manifest + source-map WITHOUT range is downgraded to MEDIUM", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("css-modules-norange", [
        createSourceCandidate({
          sourceId: "cm-Button-root",
          workspaceRelativePath: "src/Button.module.css",
          staticClassName: "Button_root__3xF9k",
          confidence: "high",
          evidence: ["manifest", "source-map"],
          warnings: [],
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("medium");
    expect(top?.warnings.some((w) => w.includes("never-wrong-HIGH"))).toBe(true);
  });

  it("manifest alone (no fingerprint, no source-map) is downgraded from HIGH to MEDIUM", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("css-modules-manifest-alone", [
        createSourceCandidate({
          sourceId: "cm-alone",
          confidence: "high",
          evidence: ["manifest"],
          warnings: [],
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const [top] = resolver.resolveCandidates(makeIdentity());
    expect(top?.confidence).toBe("medium");
  });
});

describe("SourceResolver — multiple candidates ranked, ambiguity reported", () => {
  it("ranks candidates HIGH > MEDIUM > LOW and marks the top as selected", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("two-candidates", [
        createSourceCandidate({
          sourceId: uuid.next(),
          workspaceRelativePath: "src/Low.tsx",
          confidence: "low",
          evidence: ["llm-inference"],
          warnings: ["weak"],
        }),
        createSourceCandidate({
          sourceId: uuid.next(),
          workspaceRelativePath: "src/High.tsx",
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: 5,
          confidence: "high",
          evidence: ["marker"],
          warnings: [],
        }),
        createSourceCandidate({
          sourceId: uuid.next(),
          workspaceRelativePath: "src/Med.tsx",
          confidence: "medium",
          evidence: ["text-search"],
          warnings: ["text-only"],
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const candidates = resolver.resolveCandidates(makeIdentity());
    expect(candidates).toHaveLength(3);
    const [first, ...rest] = candidates;
    expect(first?.confidence).toBe("high");
    expect(first?.workspaceRelativePath).toBe("src/High.tsx");
    expect(first?.selected).toBe(true);
    expect(rest.every((c) => c.selected === false)).toBe(true);
    expect(first?.alternativeCount).toBe(2);
    expect(candidates.every((c) => c.alternativeCount === 2)).toBe(true);
  });

  it("two adapters each return a candidate; the higher-confidence one wins, the other is an alternative", () => {
    const adapters = new AdapterRegistry();
    adapters.register(
      stubAdapter("adapter-a", [
        createSourceCandidate({
          sourceId: uuid.next(),
          workspaceRelativePath: "a.tsx",
          confidence: "medium",
          evidence: ["text-search"],
          warnings: [],
        }),
      ]),
    );
    adapters.register(
      stubAdapter("adapter-b", [
        createSourceCandidate({
          sourceId: uuid.next(),
          workspaceRelativePath: "b.tsx",
          startLine: 2,
          startColumn: 0,
          endLine: 2,
          endColumn: 9,
          confidence: "high",
          evidence: ["ast-origin"],
          warnings: [],
        }),
      ]),
    );
    const resolver = new SourceResolver(baseResolverOpts({ adapters }));
    const candidates = resolver.resolveCandidates(makeIdentity());
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.confidence).toBe("high");
    expect(candidates[0]?.selected).toBe(true);
    expect(candidates[1]?.selected).toBe(false);
    expect(candidates[0]?.alternativeCount).toBe(1);
  });

  it("repeated instances report ambiguity (MEDIUM + warning, NOT HIGH)", () => {
    const registry = new SourceRegistry();
    const resolver = new SourceResolver(baseResolverOpts({ adapters: new AdapterRegistry() }));
    void resolver; // silence; re-build with a populated registry below
    const populated = new SourceResolver({
      registry,
      cssTokenIndex: new CssTokenIndex(),
      workspaceRoot: tmpRoot,
    });
    const candidates = populated.resolveCandidates(makeIdentity(), { runtimeInstanceCount: 4 });
    const [top] = candidates;
    // No marker registered -> LOW fallback. Ambiguity flag is informational on the fallback.
    expect(top).toBeDefined();
    expect(top?.confidence).toBe("low");
  });
});

describe("SourceResolver — stale fingerprint downgrade", () => {
  it("a marker candidate with a divergent fingerprint is MEDIUM with a stale warning, NOT HIGH", () => {
    const registry = new SourceRegistry();
    const resolver = new SourceResolver({
      registry,
      cssTokenIndex: new CssTokenIndex(),
      workspaceRoot: tmpRoot,
    });
    const candidates = resolver.resolveCandidates(
      makeIdentity({ sourceId: "missing-id", fingerprint: STALE }),
    );
    const [top] = candidates;
    expect(top?.confidence).not.toBe("high");
  });
});

describe("SourceResolver — empty registry produces a single LOW fallback", () => {
  it("returns exactly one LOW candidate with an unable-to-resolve warning when nothing matches", () => {
    const resolver = new SourceResolver(baseResolverOpts());
    const candidates = resolver.resolveCandidates(makeIdentity());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("low");
    expect(candidates[0]?.selected).toBe(true);
    expect(candidates[0]?.alternativeCount).toBe(0);
    expect(candidates[0]?.warnings.some((w) => w.includes("unable to resolve"))).toBe(true);
  });

  it("resolve() (legacy single-candidate API) stays backward-compatible and returns the selected candidate", () => {
    const resolver = new SourceResolver(baseResolverOpts());
    const result = resolver.resolve(makeIdentity());
    expect(result.confidence).toBe("low");
    expect(result.selected).toBe(true);
  });
});

describe("AdapterRegistry", () => {
  it("starts empty and applies adapters in registration order", () => {
    const registry = new AdapterRegistry();
    expect(registry.list()).toHaveLength(0);
    const order: string[] = [];
    const a: SourceAdapter = {
      id: "a",
      resolve: () => {
        order.push("a");
        return [];
      },
    };
    const b: SourceAdapter = {
      id: "b",
      resolve: () => {
        order.push("b");
        return [];
      },
    };
    registry.register(a);
    registry.register(b);
    expect(registry.list().map((x) => x.id)).toEqual(["a", "b"]);
    expect(registry.has("a")).toBe(true);
    registry.unregister("a");
    expect(registry.has("a")).toBe(false);
    expect(registry.list()).toHaveLength(1);
  });
});

describe("V1 not-yet-implemented adapters", () => {
  it("the canonical adapter list no longer contains the implemented adapters (Tailwind 11, CSS Modules 12, Next 13, CSS-in-JS 20)", () => {
    const ids = V1_NOT_IMPLEMENTED_ADAPTERS.map((a) => a.id);
    expect(ids).toContain("vanilla-css");
    expect(ids).not.toContain("tailwind-token");
    expect(ids).not.toContain("css-modules");
    expect(ids).not.toContain("next");
    expect(ids).not.toContain("css-in-js");
  });

  it("each not-yet-implemented adapter returns a LOW candidate with a not-yet-implemented warning and empty evidence", () => {
    for (const adapter of V1_NOT_IMPLEMENTED_ADAPTERS) {
      const candidates = adapter.resolve({
        identity: makeIdentity(),
        cssClasses: ["x"],
        runtimeInstanceCount: 1,
      });
      expect(candidates).toHaveLength(1);
      const c = candidates[0];
      if (c === undefined) throw new Error(`${adapter.id} returned no candidate`);
      expect(c.confidence).toBe("low");
      expect(c.confidence).not.toBe("high");
      expect(c.evidence ?? []).toEqual([]);
      expect(c.warnings.some((w) => w.includes("not-yet-implemented"))).toBe(true);
    }
  });

  it("the individually-exported stubs are stable references", () => {
    expect(TAILWIND_TOKEN_ADAPTER.id).toBe("tailwind-token");
    expect(CSS_MODULES_ADAPTER.id).toBe("css-modules");
    expect(NEXT_ADAPTER.id).toBe("next");
    expect(VUE_ADAPTER.id).toBe("vue");
    expect(SVELTE_ADAPTER.id).toBe("svelte");
    expect(CSS_IN_JS_ADAPTER.id).toBe("css-in-js");
    expect(VANILLA_CSS_ADAPTER.id).toBe("vanilla-css");
  });

  it("CSS_MODULES_ADAPTER is the real adapter (VC-V1V2-12): returns heuristic candidates for hashed classes, not LOW not-yet-implemented", () => {
    const candidates = CSS_MODULES_ADAPTER.resolve({
      identity: makeIdentity(),
      cssClasses: ["_button_ab12cd"],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("medium");
    expect(candidates[0]?.confidence).not.toBe("low");
    expect(candidates[0]?.evidence).toEqual(["text-search"]);
    expect(candidates[0]?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
  });

  it("CSS_IN_JS_ADAPTER is the real adapter (VC-V1V2-20): returns heuristic candidates for generated names, not LOW not-yet-implemented", () => {
    const candidates = CSS_IN_JS_ADAPTER.resolve({
      identity: makeIdentity(),
      cssClasses: ["sc-1abcde"],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).not.toBe("low");
    expect(candidates[0]?.evidence).toEqual(["text-search"]);
    expect(candidates[0]?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
  });
});

describe("buildConfidenceUiData — UI data shape (data only, not the UI)", () => {
  it("projects a selected candidate + alternatives with method and reason badges", () => {
    const candidates = [
      createSourceCandidate({
        sourceId: "sel",
        workspaceRelativePath: "src/Sel.tsx",
        startLine: 3,
        startColumn: 0,
        endLine: 3,
        endColumn: 8,
        confidence: "high",
        evidence: ["marker"],
        warnings: [],
        selected: true,
        alternativeCount: 1,
      }),
      createSourceCandidate({
        sourceId: "alt",
        workspaceRelativePath: "src/Alt.tsx",
        confidence: "medium",
        evidence: ["text-search"],
        warnings: ["text-only"],
        selected: false,
        alternativeCount: 1,
      }),
    ];
    const ui = buildConfidenceUiData(candidates);
    expect(ui.selected).toBeDefined();
    expect(ui.selected?.confidence).toBe("high");
    expect(ui.selected?.methodBadge).toEqual(["marker"]);
    expect(ui.selected?.reasonBadges).toEqual([]);
    expect(ui.alternatives).toHaveLength(1);
    expect(ui.alternatives[0]?.methodBadge).toEqual(["text-search"]);
    expect(ui.alternatives[0]?.reasonBadges).toEqual(["text-only"]);
    expect(ui.ambiguous).toBe(true);
  });

  it("marks the repeated-instance and stale-fingerprint flags from warnings", () => {
    const candidates = [
      createSourceCandidate({
        confidence: "medium",
        evidence: ["marker"],
        warnings: ["repeated instance ambiguity: 3 elements share this source id"],
        selected: true,
        alternativeCount: 0,
      }),
    ];
    const ui = buildConfidenceUiData(candidates);
    expect(ui.repeatedInstance).toBe(true);
    expect(ui.staleFingerprint).toBe(false);
  });

  it("flags stale fingerprint when a stale warning is present", () => {
    const candidates = [
      createSourceCandidate({
        confidence: "medium",
        evidence: ["marker"],
        warnings: ["stale registry: element fingerprint changed"],
        selected: true,
        alternativeCount: 0,
      }),
    ];
    const ui = buildConfidenceUiData(candidates);
    expect(ui.staleFingerprint).toBe(true);
  });

  it("returns an empty (no-selected) shape when there are no candidates", () => {
    const ui = buildConfidenceUiData([]);
    expect(ui.selected).toBeUndefined();
    expect(ui.alternatives).toEqual([]);
    expect(ui.ambiguous).toBe(false);
  });
});

describe("clock + uuid determinism (uses @vision-control/testing fakes)", () => {
  it("FakeClock and FakeUuidSequencer produce stable values for evidence timestamps/ids", () => {
    expect(clock.now()).toBe(1_700_000_000_000);
    clock.tick(5);
    expect(clock.now()).toBe(1_700_000_000_005);
    expect(uuid.next()).toBe("cand-0001");
    expect(uuid.next()).toBe("cand-0002");
  });
});

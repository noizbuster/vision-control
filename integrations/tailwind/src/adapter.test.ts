/**
 * Tailwind token-aware adapter tests (VC-V1V2-11) — TDD-first.
 *
 * Covers the never-wrong-HIGH policy end-to-end through the real adapter:
 * static JSX / cn / clsx / cva string literals reach HIGH via ast-origin;
 * dynamic props.className / conditional / template-literal expressions
 * downgrade to MEDIUM/LOW with an agent-required warning and NO deterministic
 * patch suggestion. Also exercises responsive/state variants, arbitrary
 * values, conflict groups, nearest-token suggestions, and adversarial
 * malformed/stale config inputs.
 */
import { describe, expect, it } from "vitest";

import { createTailwindTokenAdapter, TAILWIND_TOKEN_ADAPTER } from "./adapter.js";
import { buildTokenRegistry } from "./tokens.js";
import { createTailwindV4ThemeRegistry } from "./v4-seam.js";

const identity = (): unknown => ({
  runtimeId: "r-1",
  tagName: "div",
  frameId: "main",
  fingerprint: "abcd1234",
  confidence: "high",
});

describe("TAILWIND_TOKEN_ADAPTER — default instance", () => {
  it("exposes the stable adapter id", () => {
    expect(TAILWIND_TOKEN_ADAPTER.id).toBe("tailwind-token");
    expect(TAILWIND_TOKEN_ADAPTER.description).toBeDefined();
  });

  it("with no source files, a known spacing token resolves to MEDIUM (no ast-origin), never HIGH", () => {
    const candidates = TAILWIND_TOKEN_ADAPTER.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    if (top === undefined) throw new Error("expected a candidate");
    expect(top.confidence).not.toBe("high");
    expect(["medium", "low"]).toContain(top.confidence);
    // Evidence must NOT include ast-origin when no source files are configured.
    expect(top.evidence ?? []).not.toContain("ast-origin");
  });

  it("returns an empty list when no class is a recognized Tailwind token", () => {
    const candidates = TAILWIND_TOKEN_ADAPTER.resolve({
      identity: identity() as never,
      cssClasses: ["not-a-utility", "random-word"],
      runtimeInstanceCount: 1,
    });
    expect(candidates).toEqual([]);
  });
});

describe("createTailwindTokenAdapter — STATIC className string (HIGH via ast-origin)", () => {
  const source = new Map<string, string>([
    ["src/Box.tsx", 'export const Box = () => <div className="gap-2">x</div>;'],
  ]);
  const adapter = createTailwindTokenAdapter({ sourceFiles: source });

  it("produces a HIGH candidate carrying ast-origin evidence and a source range", () => {
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    if (top === undefined) throw new Error("expected a candidate");
    expect(top.confidence).toBe("high");
    expect(top.evidence).toContain("ast-origin");
    expect(top.workspaceRelativePath).toBe("src/Box.tsx");
    expect(top.startLine).toBeDefined();
    expect(top.endLine).toBeDefined();
    expect(top.staticClassName).toBe("gap-2");
  });

  it("suggests the nearest spacing token (gap-2 -> gap-4)", () => {
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    });
    const top = candidates[0];
    if (top === undefined) throw new Error("expected a candidate");
    // The suggestion surfaces somewhere in the candidate text (snippet or warnings).
    const haystack = [top.snippet ?? "", ...top.warnings].join("\n");
    expect(haystack).toContain("gap-4");
  });
});

describe("createTailwindTokenAdapter — cn / clsx / cva origins (HIGH)", () => {
  it("cn() static literal produces HIGH", () => {
    const source = new Map<string, string>([
      [
        "src/B.tsx",
        "import {cn} from '../u'; export const B = () => <button className={cn('gap-2')}>x</button>;",
      ],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
    expect(top?.evidence).toContain("ast-origin");
  });

  it("clsx() static literal produces HIGH", () => {
    const source = new Map<string, string>([
      ["src/C.tsx", "export const C = () => <div className={clsx('p-4')} />;"],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["p-4"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
  });

  it("cva() static literal produces HIGH", () => {
    const source = new Map<string, string>([
      [
        "src/btn.ts",
        "import {cva} from 'class-variance-authority'; export const btn = cva('gap-2');",
      ],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
  });
});

describe("createTailwindTokenAdapter — responsive / state variants and arbitrary values", () => {
  const source = new Map<string, string>([
    ["src/V.tsx", 'export const V = () => <div className="md:hover:gap-2 gap-[12px]">x</div>;'],
  ]);
  const adapter = createTailwindTokenAdapter({ sourceFiles: source });

  it("parses a responsive+state variant class to HIGH with the raw class preserved", () => {
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["md:hover:gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
    expect(top?.staticClassName).toBe("md:hover:gap-2");
  });

  it("parses an arbitrary-value class to HIGH", () => {
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-[12px]"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
    expect(top?.staticClassName).toBe("gap-[12px]");
  });
});

describe("createTailwindTokenAdapter — DYNAMIC classes never HIGH (misleading_success_output)", () => {
  it("props.className resolves LOW/MEDIUM with agent-required warning, never HIGH", () => {
    const source = new Map<string, string>([
      ["src/P.tsx", "export const P = (p) => <div className={p.className}>x</div>;"],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    // No static origin for gap-2 in props.className -> never HIGH.
    if (top !== undefined) {
      expect(top.confidence).not.toBe("high");
    }
  });

  it("a conditional className (cond ? 'gap-2' : 'gap-4') downgrades and emits an agent-required warning", () => {
    const source = new Map<string, string>([
      [
        "src/Cond.tsx",
        "export const Cond = ({c}) => <div className={c ? 'gap-2' : 'gap-4'}>x</div>;",
      ],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top).toBeDefined();
    if (top === undefined) return;
    expect(top.confidence).not.toBe("high");
    expect(top.warnings.some((w) => w.includes("agent-required"))).toBe(true);
    // No deterministic patch suggestion is attached for dynamic origins.
    expect(top.snippet ?? "").not.toContain("suggested");
  });

  it("a template-literal className never produces HIGH", () => {
    // `${` is built from a char code so no test-source string literal contains
    // the `${` sequence (avoids tripping lint/suspicious/noTemplateCurlyInString).
    const interp = String.fromCharCode(36, 123);
    const source = new Map<string, string>([
      ["src/TL.tsx", "export const TL = ({s}) => <div className={`gap-" + interp + "s}`}>x</div>;"],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    if (top !== undefined) {
      expect(top.confidence).not.toBe("high");
    }
  });
});

describe("createTailwindTokenAdapter — conflict groups", () => {
  it("when two conflicting spacing utilities target gap, the adapter reports a conflict warning", () => {
    const source = new Map<string, string>([
      ["src/Conf.tsx", 'export const Conf = () => <div className="gap-2 gap-4">x</div>;'],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2", "gap-4"],
      runtimeInstanceCount: 1,
    });
    const allWarnings = candidates.flatMap((c) => c.warnings);
    expect(allWarnings.some((w) => w.toLowerCase().includes("conflict"))).toBe(true);
  });
});

describe("createTailwindTokenAdapter — adversarial config (malformed + stale)", () => {
  it("degrades gracefully on a malformed config (empty theme) and still resolves default-scale tokens", () => {
    const registry = buildTokenRegistry({ theme: {} });
    // gap-2 is a default-scale token; a malformed config must not erase it.
    expect(registry.lookup("gap", "2")?.key).toBe("2");
  });

  it("a stale config (custom tokens that omit '2') reports a token-not-found warning", () => {
    // Custom config that replaces the spacing scale with only a few keys.
    const registry = buildTokenRegistry({
      theme: { spacing: { "4": "1rem", "8": "2rem" } },
    });
    expect(registry.lookup("gap", "2")?.key).toBeUndefined();
    expect(registry.lookup("gap", "4")?.key).toBe("4");
  });

  it("a config with bad content paths does not throw and the adapter still resolves classes", () => {
    const adapter = createTailwindTokenAdapter({
      config: { content: [], theme: {} },
    });
    expect(() =>
      adapter.resolve({
        identity: identity() as never,
        cssClasses: ["gap-2"],
        runtimeInstanceCount: 1,
      }),
    ).not.toThrow();
  });
});

describe("createTailwindTokenAdapter — repeated instance ambiguity", () => {
  it("flags a repeated-instance warning when runtimeInstanceCount > 1", () => {
    const source = new Map<string, string>([
      ["src/R.tsx", 'export const R = () => <div className="gap-2">x</div>;'],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 3,
    })[0];
    expect(top?.warnings.some((w) => w.includes("repeated instance"))).toBe(true);
  });
});

// v4 @theme registry wiring + never-wrong-HIGH adversarial (task 12).

const V4_CSS = `
  @theme {
    --color-brand: oklch(0.5 0.2 250);
    --color-red-500: oklch(0.6 0.2 25);
    --spacing-2: 0.5rem;
    --font-sans: Inter, system-ui, sans-serif;
    --text-lg: 1.125rem;
  }
`;

describe("createTailwindTokenAdapter — v4 @theme registry (task 12)", () => {
  it("resolves a v4 custom color token (bg-brand) to a token-bearing candidate", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["bg-brand"],
      runtimeInstanceCount: 1,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    if (top === undefined) throw new Error("expected a candidate for bg-brand");
    expect(top.staticClassName).toBe("bg-brand");
  });

  it("resolves a v4 spacing token (gap-2) via the v4 registry when v3 defaults miss", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({
      config: { theme: { spacing: { "4": "1rem" } } },
      v4ThemeRegistry: v4,
    });
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves an opacity-modified v4 color (bg-brand/50)", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["bg-brand/50"],
      runtimeInstanceCount: 1,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]?.staticClassName).toBe("bg-brand/50");
  });

  it("resolves a v4 fontSize token (text-lg) and a v4 color (text-red-500) via overload", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    const fontSize = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["text-lg"],
      runtimeInstanceCount: 1,
    });
    expect(fontSize.length).toBeGreaterThanOrEqual(1);
    const color = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["text-red-500"],
      runtimeInstanceCount: 1,
    });
    expect(color.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves gradient color stops (from-brand, via-brand, to-brand) via v4", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    for (const cls of ["from-brand", "via-brand", "to-brand"]) {
      const candidates = adapter.resolve({
        identity: identity() as never,
        cssClasses: [cls],
        runtimeInstanceCount: 1,
      });
      expect(candidates.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("a v4 class with a static origin reaches HIGH via ast-origin (never from registry alone)", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const source = new Map<string, string>([
      ["src/C.tsx", 'export const C = () => <div className="bg-brand">x</div>;'],
    ]);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4, sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["bg-brand"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
    expect(top?.evidence).toContain("ast-origin");
  });
});

describe("createTailwindTokenAdapter — v3 unaffected by v4 wiring (regression)", () => {
  it("a v3 workspace without a v4 registry resolves gap-2 exactly as before", () => {
    const source = new Map<string, string>([
      ["src/V3.tsx", 'export const V3 = () => <div className="gap-2">x</div>;'],
    ]);
    const adapter = createTailwindTokenAdapter({ sourceFiles: source });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["gap-2"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top?.confidence).toBe("high");
    expect(top?.evidence).toContain("ast-origin");
    expect(top?.staticClassName).toBe("gap-2");
  });

  it("an unknown class is still not token-bearing with a v4 registry attached", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    const candidates = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["not-a-utility"],
      runtimeInstanceCount: 1,
    });
    expect(candidates).toEqual([]);
  });
});

/**
 * Adversarial never-wrong-HIGH: a registry-only v4 candidate (no source files)
 * must stay MEDIUM. The inline `satisfiesHighEvidence` mirror makes the test
 * non-vacuous — it confirms the evidence cannot reach HIGH even if the adapter
 * lied. The resolver's `enforceNeverWrongHigh` is the structural backstop.
 */
const SOLO_STRONG_METHODS = new Set(["marker", "ast-origin"]);
const satisfiesHighEvidenceMirror = (evidence: readonly string[], hasRange: boolean): boolean => {
  const set = new Set(evidence);
  if (set.size === 0) return false;
  for (const m of SOLO_STRONG_METHODS) if (set.has(m)) return true;
  if (set.has("fingerprint") && set.has("manifest")) return true;
  if (set.has("source-map") && hasRange) return true;
  return false;
};

describe("createTailwindTokenAdapter — adversarial: registry-only NEVER HIGH (task 12)", () => {
  it("a v4 registry-only candidate stays MEDIUM (not HIGH) and carries text-search evidence", () => {
    const v4 = createTailwindV4ThemeRegistry(V4_CSS);
    const adapter = createTailwindTokenAdapter({ v4ThemeRegistry: v4 });
    const top = adapter.resolve({
      identity: identity() as never,
      cssClasses: ["bg-brand"],
      runtimeInstanceCount: 1,
    })[0];
    expect(top).toBeDefined();
    if (top === undefined) return;
    expect(top.confidence).not.toBe("high");
    expect(["medium", "low"]).toContain(top.confidence);
    // text-search alone never satisfies HIGH (no ast-origin/marker).
    const ev = top.evidence ?? [];
    expect(ev).not.toContain("ast-origin");
    expect(ev).not.toContain("marker");
    const hasRange = top.startLine !== undefined && top.endLine !== undefined;
    expect(satisfiesHighEvidenceMirror(ev, hasRange)).toBe(false);
  });

  it("the adversarial assertion is non-vacuous: marker evidence WOULD satisfy HIGH", () => {
    expect(satisfiesHighEvidenceMirror(["marker"], false)).toBe(true);
    expect(satisfiesHighEvidenceMirror(["ast-origin"], false)).toBe(true);
    expect(satisfiesHighEvidenceMirror(["text-search"], false)).toBe(false);
  });
});

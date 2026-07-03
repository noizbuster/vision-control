/**
 * Cross-source token-registry integration tests (VC-V1V2-18) — TDD-first.
 *
 * The load-bearing test: proves the design-token registry is framework-agnostic
 * by ingesting tokens from Tailwind v3 config (`registerTailwindTokens`), a CSS
 * custom property, and an adapter hint into the SAME registry, then verifying
 * each resolves with correct source provenance. Also exercises the D15
 * structural-typing contract: an `InMemoryTokenRegistry` (source-resolver type)
 * is passed to `registerTailwindTokens` (which expects tailwind's
 * `TokenRegistrySink`) — if the structural shapes drift, this fails to compile.
 */
import { registerTailwindTokens } from "@vision-control/tailwind";
import { describe, expect, it } from "vitest";

import { detectTokenConflicts } from "./conflict-detection.js";
import { createDesignToken, InMemoryTokenRegistry } from "./registry.js";
import { resolveRuntimeCssVariable } from "./runtime-css-variables.js";

describe("cross-source integration — Tailwind v3 + CSS custom property + adapter hint", () => {
  it("ingests tokens from all three source kinds into one registry", () => {
    const registry = new InMemoryTokenRegistry();

    // 1. Tailwind v3 config tokens.
    registerTailwindTokens(
      registry,
      { theme: { spacing: { "2": "0.5rem" } } },
      {
        configPath: "tailwind.config.ts",
      },
    );

    // 2. CSS custom property token.
    registry.register(
      createDesignToken({
        name: "--color-primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property", sourcePath: "src/theme.css", sourceLine: 3 },
        aliases: ["primary"],
      }),
    );

    // 3. Adapter hint token.
    registry.register(
      createDesignToken({
        name: "vue-radius",
        category: "radius",
        value: "8px",
        provenance: { kind: "adapter-hint", adapterId: "vue-scoped" },
      }),
    );

    // All three resolve with correct provenance.
    const gap2 = registry.lookup("2");
    expect(gap2?.value).toBe("0.5rem");
    expect(gap2?.px).toBe(8);
    expect(gap2?.provenance[0]?.kind).toBe("tailwind-v3-config");
    expect(gap2?.provenance[0]?.sourcePath).toBe("tailwind.config.ts");

    const primary = registry.lookup("--color-primary");
    expect(primary?.value).toBe("#f00");
    expect(primary?.provenance[0]?.kind).toBe("css-custom-property");
    expect(primary?.provenance[0]?.sourcePath).toBe("src/theme.css");

    const vueRadius = registry.lookup("vue-radius");
    expect(vueRadius?.value).toBe("8px");
    expect(vueRadius?.provenance[0]?.kind).toBe("adapter-hint");
    expect(vueRadius?.provenance[0]?.adapterId).toBe("vue-scoped");
  });

  it("summary reports all source kinds present", () => {
    const registry = new InMemoryTokenRegistry();
    registerTailwindTokens(registry, { theme: { spacing: { "2": "0.5rem" } } });
    registry.register(
      createDesignToken({
        name: "--color-primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property" },
      }),
    );
    registry.register(
      createDesignToken({
        name: "vue-gap",
        category: "spacing",
        value: "1rem",
        provenance: { kind: "adapter-hint", adapterId: "vue" },
      }),
    );
    const summary = registry.summary();
    expect([...summary.sources].sort()).toEqual([
      "adapter-hint",
      "css-custom-property",
      "tailwind-v3-config",
    ]);
    expect(summary.totalTokens).toBeGreaterThanOrEqual(3);
  });

  it("resolves var(--color-primary) at runtime against the CSS custom property token", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "--color-primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property" },
      }),
    );
    const resolution = resolveRuntimeCssVariable("var(--color-primary)", registry);
    expect(resolution.resolved?.value).toBe("#f00");
    expect(resolution.resolved?.provenance[0]?.kind).toBe("css-custom-property");
    expect(resolution.warning).toBeUndefined();
  });

  it("reports unresolved-token warning for an unknown var() (no patch suggestion)", () => {
    const registry = new InMemoryTokenRegistry();
    registerTailwindTokens(registry, { theme: { spacing: { "2": "0.5rem" } } });
    const resolution = resolveRuntimeCssVariable("var(--mystery-var)", registry);
    expect(resolution.resolved).toBeUndefined();
    expect(resolution.warning).toContain("unresolved-token");
    expect(resolution.warning).toMatch(/no deterministic patch suggestion/i);
  });
});

describe("cross-source integration — conflict detection across sources", () => {
  it("detects a conflict when Tailwind and CSS custom property disagree on a name", () => {
    const registry = new InMemoryTokenRegistry();
    // Tailwind registers spacing "2" = "0.5rem".
    registerTailwindTokens(registry, { theme: { spacing: { "2": "0.5rem" } } });
    // A CSS custom property also defines "--2" = "0.75rem" (different value).
    registry.register(
      createDesignToken({
        name: "2",
        category: "spacing",
        value: "0.75rem",
        provenance: { kind: "css-custom-property" },
      }),
    );
    const conflicts = detectTokenConflicts(registry.registrations());
    expect(conflicts).toHaveLength(1);
    const first = conflicts[0];
    expect(first?.name).toBe("2");
    expect(first && [...first.distinctValues].sort()).toEqual(["0.5rem", "0.75rem"]);
    expect(first && [...first.sources.map((s) => s.kind)].sort()).toEqual([
      "css-custom-property",
      "tailwind-v3-config",
    ]);
  });

  it("no conflict when Tailwind and CSS agree on the same value", () => {
    const registry = new InMemoryTokenRegistry();
    registerTailwindTokens(registry, { theme: { spacing: { "2": "0.5rem" } } });
    registry.register(
      createDesignToken({
        name: "2",
        category: "spacing",
        value: "0.5rem",
        provenance: { kind: "css-custom-property" },
      }),
    );
    const conflicts = detectTokenConflicts(registry.registrations());
    expect(conflicts).toEqual([]);
    // The resolved token merges provenance from both sources.
    const resolved = registry.lookup("2");
    expect(resolved?.provenance).toHaveLength(2);
  });
});

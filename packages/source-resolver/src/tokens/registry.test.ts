/**
 * Design-token registry tests (VC-V1V2-18) — TDD-first.
 *
 * Covers: multi-source ingest (Tailwind v3 + CSS custom property + adapter
 * hint), provenance merge on agreement, conflict on disagreement, deterministic
 * first-registered-wins lookup, alias resolution, category filtering, summary
 * export, and malformed-input rejection at the boundary.
 */
import { describe, expect, it } from "vitest";

import {
  createDesignToken,
  type DesignToken,
  DesignTokenSchema,
  InMemoryTokenRegistry,
  type ResolvedToken,
  type TokenRegistry,
} from "./registry.js";

const spacingToken = (
  name: string,
  value: string,
  kind: DesignToken["provenance"]["kind"] = "tailwind-v3-config",
  provenanceExtra?: { readonly sourcePath?: string; readonly adapterId?: string },
): DesignToken =>
  createDesignToken({
    name,
    category: "spacing",
    value,
    provenance: { kind, ...(provenanceExtra ?? {}) },
  });

const cssVarToken = (name: string, value: string): DesignToken =>
  createDesignToken({
    name,
    category: "color",
    value,
    provenance: { kind: "css-custom-property", sourcePath: "src/theme.css" },
  });

describe("DesignTokenSchema", () => {
  it("accepts a well-formed token", () => {
    const result = DesignTokenSchema.safeParse({
      name: "gap-2",
      category: "spacing",
      value: "0.5rem",
      provenance: { kind: "tailwind-v3-config" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a token with an unknown category", () => {
    expect(
      DesignTokenSchema.safeParse({
        name: "x",
        category: "bogus",
        value: "1px",
        provenance: { kind: "css-custom-property" },
      }).success,
    ).toBe(false);
  });

  it("rejects a token missing provenance", () => {
    expect(
      DesignTokenSchema.safeParse({ name: "x", category: "spacing", value: "1px" }).success,
    ).toBe(false);
  });
});

describe("InMemoryTokenRegistry — basic register/lookup", () => {
  it("registers a Tailwind v3 token and looks it up by name", () => {
    const registry: TokenRegistry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem"));
    const token = registry.lookup("gap-2");
    expect(token).toBeDefined();
    expect(token?.value).toBe("0.5rem");
    expect(token?.category).toBe("spacing");
    expect(token?.provenance).toHaveLength(1);
    expect(token?.provenance[0]?.kind).toBe("tailwind-v3-config");
  });

  it("registers a CSS custom property token and looks it up", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(cssVarToken("--color-primary", "#f00"));
    const token = registry.lookup("--color-primary");
    expect(token?.value).toBe("#f00");
    expect(token?.provenance[0]?.kind).toBe("css-custom-property");
  });

  it("returns undefined for an unknown name", () => {
    const registry = new InMemoryTokenRegistry();
    expect(registry.lookup("nope")).toBeUndefined();
  });

  it("exposes size as the number of unique names", () => {
    const registry = new InMemoryTokenRegistry();
    expect(registry.size).toBe(0);
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.register(spacingToken("gap-4", "1rem"));
    expect(registry.size).toBe(2);
  });
});

describe("InMemoryTokenRegistry — multi-source provenance merge", () => {
  it("merges provenance when two sources agree on value", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      spacingToken("gap-2", "0.5rem", "tailwind-v3-config", { sourcePath: "tailwind.config.ts" }),
    );
    registry.register(
      createDesignToken({
        name: "gap-2",
        category: "spacing",
        value: "0.5rem",
        provenance: { kind: "css-custom-property", sourcePath: "src/theme.css" },
      }),
    );
    const token = registry.lookup("gap-2");
    expect(token?.value).toBe("0.5rem");
    // Both sources agree -> merged provenance, both kinds present.
    expect(token?.provenance).toHaveLength(2);
    const kinds = token?.provenance.map((p) => p.kind).sort();
    expect(kinds).toEqual(["css-custom-property", "tailwind-v3-config"]);
  });

  it("keeps px from the first-registered winning entry", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "gap-2",
        category: "spacing",
        value: "0.5rem",
        px: 8,
        provenance: { kind: "tailwind-v3-config" },
      }),
    );
    registry.register(
      createDesignToken({
        name: "gap-2",
        category: "spacing",
        value: "0.5rem",
        provenance: { kind: "css-custom-property" },
      }),
    );
    expect(registry.lookup("gap-2")?.px).toBe(8);
  });
});

describe("InMemoryTokenRegistry — conflict (same name, different value)", () => {
  it("returns the first-registered value deterministically on conflict", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.register(spacingToken("gap-2", "0.75rem", "css-custom-property"));
    const token = registry.lookup("gap-2");
    expect(token?.value).toBe("0.5rem"); // first wins
    // Only the agreeing source is in provenance (the dissenter is not merged).
    expect(token?.provenance).toHaveLength(1);
    expect(token?.provenance[0]?.kind).toBe("tailwind-v3-config");
  });

  it("counts the conflict in summary", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.register(spacingToken("gap-2", "0.75rem", "css-custom-property"));
    registry.register(spacingToken("gap-4", "1rem"));
    const summary = registry.summary();
    expect(summary.conflictCount).toBe(1);
    expect(summary.totalTokens).toBe(2);
  });
});

describe("InMemoryTokenRegistry — aliases", () => {
  it("resolves a token by its alias", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "color-primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property" },
        aliases: ["--color-primary", "primary"],
      }),
    );
    expect(registry.lookupByAlias("--color-primary")?.name).toBe("color-primary");
    expect(registry.lookupByAlias("primary")?.name).toBe("color-primary");
  });

  it("first registration of an alias wins (deterministic)", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "red",
        category: "color",
        value: "#f00",
        provenance: { kind: "tailwind-v3-config" },
        aliases: ["primary"],
      }),
    );
    registry.register(
      createDesignToken({
        name: "blue",
        category: "color",
        value: "#00f",
        provenance: { kind: "tailwind-v3-config" },
        aliases: ["primary"],
      }),
    );
    expect(registry.lookupByAlias("primary")?.name).toBe("red");
  });

  it("returns undefined for an unknown alias", () => {
    const registry = new InMemoryTokenRegistry();
    expect(registry.lookupByAlias("nothing")).toBeUndefined();
  });
});

describe("InMemoryTokenRegistry — category filtering", () => {
  it("returns only tokens of the requested category", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.register(cssVarToken("primary", "#f00"));
    registry.register(cssVarToken("secondary", "#0f0"));
    const colors = registry.byCategory("color");
    expect(colors.map((t) => t.name).sort()).toEqual(["primary", "secondary"]);
    expect(registry.byCategory("radius")).toEqual([]);
  });
});

describe("InMemoryTokenRegistry — all() and registrations()", () => {
  it("all() returns one resolved token per unique name in insertion order", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-4", "1rem"));
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.register(spacingToken("gap-4", "1rem", "css-custom-property"));
    const all = registry.all();
    expect(all.map((t) => t.name)).toEqual(["gap-4", "gap-2"]);
    // gap-4 has two agreeing sources -> merged provenance.
    const gap4 = all.find((t) => t.name === "gap-4");
    expect(gap4?.provenance).toHaveLength(2);
  });

  it("registrations() returns all raw entries including duplicates", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-4", "1rem"));
    registry.register(spacingToken("gap-4", "1rem", "css-custom-property"));
    expect(registry.registrations()).toHaveLength(2);
  });
});

describe("InMemoryTokenRegistry — summary()", () => {
  it("summarises categories, sources, totals, and conflicts", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem", "tailwind-v3-config"));
    registry.register(
      createDesignToken({
        name: "primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property" },
      }),
    );
    registry.register(
      createDesignToken({
        name: "primary",
        category: "color",
        value: "#0f0",
        provenance: { kind: "adapter-hint", adapterId: "vue" },
      }),
    );
    const summary = registry.summary();
    expect(summary.totalTokens).toBe(2);
    expect(summary.categories.spacing).toBe(1);
    expect(summary.categories.color).toBe(1);
    expect([...summary.sources].sort()).toEqual([
      "adapter-hint",
      "css-custom-property",
      "tailwind-v3-config",
    ]);
    expect(summary.conflictCount).toBe(1); // "primary" has two values
  });

  it("reports zero conflicts for an empty registry", () => {
    expect(new InMemoryTokenRegistry().summary().conflictCount).toBe(0);
  });
});

describe("InMemoryTokenRegistry — clear and registerMany", () => {
  it("registerMany bulk-loads tokens", () => {
    const registry = new InMemoryTokenRegistry();
    registry.registerMany([spacingToken("gap-2", "0.5rem"), spacingToken("gap-4", "1rem")]);
    expect(registry.size).toBe(2);
  });

  it("clear removes everything", () => {
    const registry = new InMemoryTokenRegistry();
    registry.register(spacingToken("gap-2", "0.5rem"));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.lookup("gap-2")).toBeUndefined();
  });
});

describe("InMemoryTokenRegistry — malformed-input defense", () => {
  it("throws on register with a bad category", () => {
    const registry = new InMemoryTokenRegistry();
    expect(() =>
      registry.register({
        name: "x",
        category: "bogus" as never,
        value: "1px",
        provenance: { kind: "css-custom-property" },
      }),
    ).toThrow();
  });

  it("throws on register with an empty name", () => {
    const registry = new InMemoryTokenRegistry();
    expect(() =>
      registry.register({
        name: "",
        category: "spacing",
        value: "1px",
        provenance: { kind: "css-custom-property" },
      }),
    ).toThrow();
  });

  it("does not corrupt the registry after a failed register", () => {
    const registry = new InMemoryTokenRegistry();
    expect(() => registry.register(spacingToken("gap-2", "0.5rem"))).not.toThrow();
    expect(() =>
      registry.register({
        name: "bad",
        category: "bogus" as never,
        value: "1px",
        provenance: { kind: "css-custom-property" },
      }),
    ).toThrow();
    expect(registry.size).toBe(1);
    expect(registry.lookup("gap-2")?.value).toBe("0.5rem");
  });
});

describe("InMemoryTokenRegistry — adapter-hint token resolves with provenance", () => {
  it("registers and resolves an adapter-hint token", (): ResolvedToken | undefined => {
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "vue-spacing-4",
        category: "spacing",
        value: "1rem",
        provenance: { kind: "adapter-hint", adapterId: "vue-scoped" },
      }),
    );
    const token = registry.lookup("vue-spacing-4");
    expect(token?.provenance[0]?.kind).toBe("adapter-hint");
    expect(token?.provenance[0]?.adapterId).toBe("vue-scoped");
    return token;
  });
});

/**
 * Tailwind v4 `@theme` parser tests (VC-V1V2-11 / task 11) — TDD-first.
 *
 * These tests were written FIRST against the V1 no-op seam and failed; the
 * implementation in `v4-theme-parser.ts` + `v4-seam.ts` makes them pass. The
 * parser produces token DATA only — it never carries confidence/evidence
 * (never-wrong-HIGH is the resolver's job, task 12).
 */
import { describe, expect, it } from "vitest";
import type { TailwindToken } from "./tokens.js";
import {
  createTailwindV4ThemeRegistry,
  NOOP_V4_THEME_REGISTRY,
  type TailwindV4ThemeRegistry,
} from "./v4-seam.js";
import { parseThemeTokens, THEME_NAMESPACE_RULES } from "./v4-theme-parser.js";

const THEME_CSS = `
  @theme {
    --color-brand: oklch(0.5 0.2 250);
    --color-red-500: oklch(0.6 0.2 25);
    --spacing-2: 0.5rem;
    --spacing-4: 1rem;
    --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
    --text-lg: 1.125rem;
  }
`;

describe("parseThemeTokens — happy path namespace mapping", () => {
  it("maps --color-* to the color category", () => {
    const tokens = parseThemeTokens(THEME_CSS);
    const brand = tokens.find((t) => t.key === "brand");
    expect(brand).toBeDefined();
    expect(brand?.category).toBe("color");
    expect(brand?.value).toBe("oklch(0.5 0.2 250)");
    expect(brand?.px).toBeUndefined();
  });

  it("maps --spacing-* to the spacing category with px equivalents", () => {
    const tokens = parseThemeTokens(THEME_CSS);
    const spacing2 = tokens.find((t) => t.category === "spacing" && t.key === "2");
    expect(spacing2).toBeDefined();
    expect(spacing2?.value).toBe("0.5rem");
    expect(spacing2?.px).toBe(8);
    const spacing4 = tokens.find((t) => t.category === "spacing" && t.key === "4");
    expect(spacing4?.px).toBe(16);
  });

  it("maps --font-* to the fontFamily category", () => {
    const tokens = parseThemeTokens(THEME_CSS);
    const sans = tokens.find((t) => t.category === "fontFamily");
    expect(sans).toBeDefined();
    expect(sans?.key).toBe("sans");
    // Value preserves the full declaration (comma list + quotes).
    expect(sans?.value).toBe('"Inter", ui-sans-serif, system-ui, sans-serif');
  });

  it("maps --text-* to the fontSize category", () => {
    const tokens = parseThemeTokens(THEME_CSS);
    const lg = tokens.find((t) => t.category === "fontSize");
    expect(lg).toBeDefined();
    expect(lg?.key).toBe("lg");
    expect(lg?.value).toBe("1.125rem");
  });

  it("emits exactly the four known namespaces and skips everything else", () => {
    const tokens = parseThemeTokens(`
      @theme {
        --color-a: #000;
        --spacing-b: 1px;
        --font-c: serif;
        --text-d: 1rem;
        --radius-e: 0.25rem;
        --shadow-f: 0 1px 2px black;
        --font-weight-bold: 700;
        --leading-tall: 2;
      }
    `);
    const categories = new Set(tokens.map((t) => t.category));
    expect([...categories].sort()).toEqual(["color", "fontFamily", "fontSize", "spacing"]);
    // Unknown-namespace declarations are skipped (not emitted as "unknown").
    expect(tokens.some((t) => t.category === "unknown")).toBe(false);
    expect(tokens.every((t) => !t.key.startsWith("weight"))).toBe(true);
  });
});

describe("parseThemeTokens — adversarial wrong-category probe", () => {
  // This test exists specifically to FAIL if the parser returns a wrong
  // category. If someone refactors the namespace map and --color-* starts
  // returning "spacing", this is the canary. Confirms the test surface is
  // sensitive, not a tautology.
  it("would fail if --color-* returned a non-color category", () => {
    const tokens = parseThemeTokens("@theme { --color-canary: #abc; }");
    const canary = tokens[0];
    if (canary === undefined) throw new Error("canary token missing");
    expect(canary.category).toBe("color");
    expect(canary.category).not.toBe("spacing");
    expect(canary.category).not.toBe("fontSize");
  });

  it("would fail if --font-* returned fontSize instead of fontFamily", () => {
    const tokens = parseThemeTokens("@theme { --font-mono: monospace; }");
    const t = tokens[0];
    if (t === undefined) throw new Error("token missing");
    expect(t.category).toBe("fontFamily");
    expect(t.category).not.toBe("fontSize");
  });

  it("disambiguates font-weight (skip) from font (family) via longest-prefix rule", () => {
    const tokens = parseThemeTokens("@theme { --font-weight-bold: 700; --font-sans: serif; }");
    const keys = tokens.map((t) => t.key);
    expect(keys).toContain("sans");
    // font-weight is a recognised-but-unmapped v4 namespace → skipped, never
    // mis-attributed to fontFamily as key "weight-bold".
    expect(keys).not.toContain("weight-bold");
    expect(tokens.every((t) => t.category === "fontFamily")).toBe(true);
  });
});

describe("parseThemeTokens — graceful malformed / stale input", () => {
  it("returns empty on a CSS file with no @theme (stale state)", () => {
    const css = ":root { --color-x: #fff; } .btn { color: red; }";
    expect(parseThemeTokens(css)).toEqual([]);
  });

  it("returns empty on an empty string", () => {
    expect(parseThemeTokens("")).toEqual([]);
  });

  it("does NOT throw on a malformed @theme block (unclosed brace)", () => {
    const malformed = "@theme { --color-brand: oklch(0.5 0.2 250);";
    expect(() => parseThemeTokens(malformed)).not.toThrow();
    expect(parseThemeTokens(malformed)).toEqual([]);
  });

  it("does NOT throw on garbage input", () => {
    const garbage = "}}} --@@@ not css at all {{{";
    expect(() => parseThemeTokens(garbage)).not.toThrow();
  });

  it("skips declarations with empty values", () => {
    const tokens = parseThemeTokens("@theme { --color-brand: ; --color-real: #000; }");
    expect(tokens.map((t) => t.key)).toEqual(["real"]);
  });

  it("skips non-custom-property declarations inside @theme", () => {
    const tokens = parseThemeTokens("@theme { color: red; --color-real: #000; }");
    expect(tokens.map((t) => t.key)).toEqual(["real"]);
  });
});

describe("parseThemeTokens — multiple blocks + modifiers", () => {
  it("merges tokens across multiple @theme blocks, deduping by full name", () => {
    const css = `
      @theme { --color-a: #111; }
      @theme { --spacing-2: 0.5rem; }
      @theme { --color-a: #222; }
    `;
    const tokens = parseThemeTokens(css);
    const colorA = tokens.filter((t) => t.key === "a");
    expect(colorA.length).toBe(1);
    // First registration wins (deterministic, matches source-resolver semantics).
    expect(colorA[0]?.value).toBe("#111");
    expect(tokens.some((t) => t.category === "spacing" && t.key === "2")).toBe(true);
  });

  it("parses @theme inline and @theme reference modifiers", () => {
    const css = `
      @theme inline { --color-inline: #333; }
      @theme reference { --spacing-ref: 2rem; }
    `;
    const tokens = parseThemeTokens(css);
    const keys = tokens.map((t) => t.key).sort();
    expect(keys).toEqual(["inline", "ref"]);
  });
});

describe("createTailwindV4ThemeRegistry — resolveThemeVariable", () => {
  const registry: TailwindV4ThemeRegistry = createTailwindV4ThemeRegistry(THEME_CSS);

  it("resolves by the full custom-property name (without leading --)", () => {
    const t = registry.resolveThemeVariable("color-brand");
    expect(t?.category).toBe("color");
    expect(t?.value).toBe("oklch(0.5 0.2 250)");
  });

  it("resolves by a bare token key when unambiguous", () => {
    const t = registry.resolveThemeVariable("brand");
    expect(t?.category).toBe("color");
    expect(t?.key).toBe("brand");
  });

  it("tolerates a leading -- on the lookup name (boundary normalization)", () => {
    const t = registry.resolveThemeVariable("--spacing-2");
    expect(t?.category).toBe("spacing");
    expect(t?.px).toBe(8);
  });

  it("resolves namespaced multi-segment keys (red-500)", () => {
    const t = registry.resolveThemeVariable("color-red-500");
    expect(t?.value).toBe("oklch(0.6 0.2 25)");
  });

  it("returns undefined for an unknown name", () => {
    expect(registry.resolveThemeVariable("color-missing")).toBeUndefined();
    expect(registry.resolveThemeVariable("nope")).toBeUndefined();
  });

  it("returns undefined on the empty-registry path (stale / malformed)", () => {
    const empty = createTailwindV4ThemeRegistry(":root { --x: 1; }");
    expect(empty.resolveThemeVariable("color-x")).toBeUndefined();
    const malformed = createTailwindV4ThemeRegistry("@theme { --color-x: red;");
    expect(malformed.resolveThemeVariable("color-x")).toBeUndefined();
  });
});

describe("createTailwindV4ThemeRegistry — listThemeVariables", () => {
  it("lists every parsed token", () => {
    const registry = createTailwindV4ThemeRegistry(THEME_CSS);
    const list = registry.listThemeVariables();
    expect(list.length).toBe(6);
    const keys = list.map((t) => `${t.category}:${t.key}`).sort();
    expect(keys).toContain("color:brand");
    expect(keys).toContain("color:red-500");
    expect(keys).toContain("spacing:2");
    expect(keys).toContain("fontFamily:sans");
    expect(keys).toContain("fontSize:lg");
  });

  it("returns an empty list for a no-@theme CSS", () => {
    expect(createTailwindV4ThemeRegistry(".a { color: red; }").listThemeVariables()).toEqual([]);
  });
});

describe("never-wrong-HIGH — tokens are pure data", () => {
  // The registry must NOT emit confidence/evidence. Those fields belong to the
  // resolver cascade; a registry token is data, never a HIGH candidate on its
  // own (task 12 adds the adversarial "registry-only stays MEDIUM" test).
  it("parsed tokens carry only data fields (no confidence/evidence)", () => {
    const tokens = parseThemeTokens(THEME_CSS);
    for (const token of tokens) {
      const snapshot: Record<string, unknown> = { ...token };
      const keys = Object.keys(snapshot);
      expect(keys).not.toContain("confidence");
      expect(keys).not.toContain("evidence");
    }
  });

  it("the namespace rule set only declares data categories, never a confidence", () => {
    // THEME_NAMESPACE_RULES maps namespace -> TokenCategory (a data taxonomy).
    for (const rule of THEME_NAMESPACE_RULES) {
      const category = rule[1];
      expect(
        category === null || ["color", "spacing", "fontFamily", "fontSize"].includes(category),
      ).toBe(true);
    }
  });
});

describe("NOOP_V4_THEME_REGISTRY — backwards-compat surface", () => {
  it("still resolves nothing (the honest no-op kept for the default)", () => {
    expect(NOOP_V4_THEME_REGISTRY.resolveThemeVariable("color-x")).toBeUndefined();
    expect(NOOP_V4_THEME_REGISTRY.listThemeVariables()).toEqual([]);
  });
});

describe("manual QA — parsed-token demo dump", () => {
  // Manual-QA channel: this test logs the parsed tokens for an inline CSS
  // fixture so a human can eyeball the namespace → category mapping in the
  // test output. It also asserts a token round-trips to the expected shape.
  it("dumps parsed tokens for a representative v4 globals.css fixture", () => {
    const demoCss = `
      @import "tailwindcss";
      @theme {
        --color-brand: oklch(0.5 0.2 250);
        --color-accent: #ff5722;
        --spacing-2: 0.5rem;
        --spacing-8: 2rem;
        --font-sans: Inter, system-ui, sans-serif;
        --text-lg: 1.125rem;
        --radius-md: 0.375rem;        /* skipped: radius not in narrow set */
        --shadow-card: 0 1px 3px rgb(0 0 0 / 0.1); /* skipped: shadow */
        --font-weight-bold: 700;      /* skipped: fontWeight, not fontFamily */
      }
      body { margin: 0; }
    `;
    const tokens = parseThemeTokens(demoCss);
    const dump: Array<Record<string, unknown>> = tokens.map((t) => {
      const row: Record<string, unknown> = {
        key: t.key,
        category: t.category,
        value: t.value,
      };
      if (t.px !== undefined) row.px = t.px;
      return row;
    });
    // eslint-disable-next-line no-console
    console.log("[v4-theme-parser demo] parsed tokens:\n", JSON.stringify(dump, null, 2));

    expect(tokens.length).toBe(6);
    const spacing2: TailwindToken | undefined = tokens.find(
      (t) => t.category === "spacing" && t.key === "2",
    );
    expect(spacing2).toEqual({ key: "2", category: "spacing", value: "0.5rem", px: 8 });
  });
});

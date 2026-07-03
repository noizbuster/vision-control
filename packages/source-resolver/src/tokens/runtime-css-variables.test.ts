/**
 * Runtime CSS variable resolution tests (VC-V1V2-18) — TDD-first.
 *
 * Covers: var() reference resolution, bare --name resolution, alias fallback,
 * stripped-prefix fallback, the unresolved-token warning (with explicit
 * NO-patch-suggestion guard), multi-var value scanning, and non-variable input.
 */
import { describe, expect, it } from "vitest";

import { createDesignToken, InMemoryTokenRegistry } from "./registry.js";
import {
  extractVariableName,
  resolveAllVarReferences,
  resolveRuntimeCssVariable,
  UNRESOLVED_TOKEN_WARNING_CODE,
} from "./runtime-css-variables.js";

const buildRegistry = () => {
  const registry = new InMemoryTokenRegistry();
  registry.register(
    createDesignToken({
      name: "--color-primary",
      category: "color",
      value: "#f00",
      provenance: { kind: "css-custom-property", sourcePath: "theme.css" },
    }),
  );
  registry.register(
    createDesignToken({
      name: "gap-2",
      category: "spacing",
      value: "0.5rem",
      px: 8,
      provenance: { kind: "tailwind-v3-config" },
      aliases: ["--gap-2"],
    }),
  );
  return registry;
};

describe("extractVariableName", () => {
  it("extracts a bare --name", () => {
    expect(extractVariableName("--color-primary")).toBe("--color-primary");
  });

  it("extracts from var(--name)", () => {
    expect(extractVariableName("var(--color-primary)")).toBe("--color-primary");
  });

  it("extracts from var(--name, fallback) ignoring the fallback", () => {
    expect(extractVariableName("var(--gap-2, 1rem)")).toBe("--gap-2");
  });

  it("tolerates internal whitespace", () => {
    expect(extractVariableName("var(  --color-primary  )")).toBe("--color-primary");
  });

  it("returns undefined for a non-variable value", () => {
    expect(extractVariableName("#ff0000")).toBeUndefined();
    expect(extractVariableName("0.5rem")).toBeUndefined();
    expect(extractVariableName("")).toBeUndefined();
  });
});

describe("resolveRuntimeCssVariable — matches", () => {
  it("resolves var(--color-primary) to the registered CSS custom-property token", () => {
    const resolution = resolveRuntimeCssVariable("var(--color-primary)", buildRegistry());
    expect(resolution.resolved?.name).toBe("--color-primary");
    expect(resolution.resolved?.value).toBe("#f00");
    expect(resolution.warning).toBeUndefined();
  });

  it("resolves a bare --color-primary name", () => {
    const resolution = resolveRuntimeCssVariable("--color-primary", buildRegistry());
    expect(resolution.resolved?.value).toBe("#f00");
    expect(resolution.warning).toBeUndefined();
  });

  it("resolves var(--gap-2) by alias", () => {
    const resolution = resolveRuntimeCssVariable("var(--gap-2)", buildRegistry());
    expect(resolution.resolved?.name).toBe("gap-2");
    expect(resolution.resolved?.value).toBe("0.5rem");
  });

  it("resolves a bare --gap-2 by alias", () => {
    const resolution = resolveRuntimeCssVariable("--gap-2", buildRegistry());
    expect(resolution.resolved?.name).toBe("gap-2");
  });

  it("resolves var(--color-primary, fallback) keeping the primary match", () => {
    const resolution = resolveRuntimeCssVariable("var(--color-primary, #000)", buildRegistry());
    expect(resolution.resolved?.value).toBe("#f00");
  });

  it("carries provenance through the resolution", () => {
    const resolution = resolveRuntimeCssVariable("--color-primary", buildRegistry());
    expect(resolution.resolved?.provenance[0]?.kind).toBe("css-custom-property");
    expect(resolution.resolved?.provenance[0]?.sourcePath).toBe("theme.css");
  });
});

describe("resolveRuntimeCssVariable — unresolved (misleading-success guard)", () => {
  it("reports an unresolved-token warning for an unknown var()", () => {
    const resolution = resolveRuntimeCssVariable("var(--totally-unknown)", buildRegistry());
    expect(resolution.resolved).toBeUndefined();
    expect(resolution.warning).toBeDefined();
    expect(resolution.warning).toContain(UNRESOLVED_TOKEN_WARNING_CODE);
    expect(resolution.warning).toContain("--totally-unknown");
  });

  it("does NOT include a deterministic patch suggestion in the warning", () => {
    const resolution = resolveRuntimeCssVariable("var(--mystery)", buildRegistry());
    expect(resolution.warning).toBeDefined();
    // The warning must NOT suggest a replacement value.
    expect(resolution.warning).not.toMatch(/->|→|replace with/i);
    expect(resolution.warning).toMatch(/no deterministic patch suggestion/i);
  });

  it("reports unresolved for a bare unknown --name", () => {
    const resolution = resolveRuntimeCssVariable("--nope", buildRegistry());
    expect(resolution.resolved).toBeUndefined();
    expect(resolution.warning).toContain(UNRESOLVED_TOKEN_WARNING_CODE);
  });

  it("reports unresolved for an empty registry", () => {
    const empty = new InMemoryTokenRegistry();
    const resolution = resolveRuntimeCssVariable("var(--color-primary)", empty);
    expect(resolution.resolved).toBeUndefined();
    expect(resolution.warning).toBeDefined();
  });
});

describe("resolveRuntimeCssVariable — non-variable input", () => {
  it("returns no resolution and no warning for a plain value", () => {
    const resolution = resolveRuntimeCssVariable("#ff0000", buildRegistry());
    expect(resolution.resolved).toBeUndefined();
    expect(resolution.warning).toBeUndefined();
    expect(resolution.variableName).toBeUndefined();
  });
});

describe("resolveAllVarReferences", () => {
  it("resolves every var() in a multi-variable value", () => {
    const cssValue = "var(--color-primary) var(--gap-2)";
    const results = resolveAllVarReferences(cssValue, buildRegistry());
    expect(results).toHaveLength(2);
    expect(results[0]?.resolved?.value).toBe("#f00");
    expect(results[1]?.resolved?.name).toBe("gap-2");
  });

  it("surfaces unresolved warnings for unknown vars in a chain", () => {
    const cssValue = "var(--color-primary) var(--unknown-one)";
    const results = resolveAllVarReferences(cssValue, buildRegistry());
    expect(results).toHaveLength(2);
    expect(results[0]?.resolved?.value).toBe("#f00");
    expect(results[1]?.resolved).toBeUndefined();
    expect(results[1]?.warning).toContain(UNRESOLVED_TOKEN_WARNING_CODE);
  });

  it("returns an empty array for a value with no var() references", () => {
    expect(resolveAllVarReferences("1rem solid #000", buildRegistry())).toEqual([]);
  });
});

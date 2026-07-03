/**
 * Tailwind token-registry ingest tests (VC-V1V2-18) — TDD-first.
 *
 * Verifies `registerTailwindTokens` emits correctly-shaped tokens with
 * `tailwind-v3-config` provenance into a {@link TokenRegistrySink}. Uses a local
 * fake sink (tailwind does NOT import source-resolver — D15); the cross-source
 * integration against the real `InMemoryTokenRegistry` lives in
 * `packages/source-resolver/src/tokens/`.
 */
import { describe, expect, it } from "vitest";

import {
  registerTailwindTokens,
  type TailwindDesignTokenExport,
  type TokenRegistrySink,
} from "./tokens.js";

const collectSink = (): { sink: TokenRegistrySink; tokens: TailwindDesignTokenExport[] } => {
  const tokens: TailwindDesignTokenExport[] = [];
  return { tokens, sink: { register: (t) => tokens.push(t) } };
};

describe("registerTailwindTokens — default config", () => {
  it("registers spacing tokens with rem values and px equivalents", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    const gap2 = tokens.find((t) => t.name === "2");
    expect(gap2).toBeDefined();
    expect(gap2?.value).toBe("0.5rem");
    expect(gap2?.px).toBe(8);
    expect(gap2?.category).toBe("spacing");
  });

  it("registers color tokens", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    const red500 = tokens.find((t) => t.name === "red-500");
    expect(red500).toBeDefined();
    expect(red500?.value).toBe("#ef4444");
    expect(red500?.category).toBe("color");
  });

  it("registers fontSize tokens", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    const lg = tokens.find((t) => t.name === "lg");
    expect(lg).toBeDefined();
    expect(lg?.value).toBe("1.125rem");
    expect(lg?.category).toBe("fontSize");
  });

  it("registers fontFamily tokens", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    const sans = tokens.find((t) => t.name === "sans");
    expect(sans).toBeDefined();
    expect(sans?.category).toBe("fontFamily");
  });

  it("attaches tailwind-v3-config provenance to every token", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.provenance.kind).toBe("tailwind-v3-config");
    }
  });

  it("includes the config path in provenance when provided", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink, {}, { configPath: "tailwind.config.ts" });
    const first = tokens[0];
    expect(first?.provenance.kind).toBe("tailwind-v3-config");
    expect(first?.provenance.sourcePath).toBe("tailwind.config.ts");
  });

  it("omits sourcePath when no config path is provided", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    expect(tokens[0]?.provenance.sourcePath).toBeUndefined();
  });
});

describe("registerTailwindTokens — custom config", () => {
  it("registers top-level custom spacing tokens (replaces default scale)", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink, {
      theme: { spacing: { custom: "5rem" } },
    });
    const custom = tokens.find((t) => t.name === "custom");
    expect(custom?.value).toBe("5rem");
  });

  it("registers custom top-level colors", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink, {
      theme: { colors: { brand: "#123456" } },
    });
    const brand = tokens.find((t) => t.name === "brand");
    expect(brand?.value).toBe("#123456");
    expect(brand?.category).toBe("color");
  });

  it("registers custom top-level fontSize tokens", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink, {
      theme: { fontSize: { huge: "4rem" } },
    });
    const huge = tokens.find((t) => t.name === "huge");
    expect(huge?.value).toBe("4rem");
    expect(huge?.category).toBe("fontSize");
  });
});

describe("registerTailwindTokens — malformed-input defense", () => {
  it("degrades gracefully on an empty config (still registers defaults)", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink, {});
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("produces no tokens with an empty category field", () => {
    const { sink, tokens } = collectSink();
    registerTailwindTokens(sink);
    expect(tokens.every((t) => t.category.length > 0)).toBe(true);
  });
});

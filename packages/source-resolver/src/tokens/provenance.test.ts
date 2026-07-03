/**
 * Token provenance tests (VC-V1V2-18) — TDD-first.
 */
import { describe, expect, it } from "vitest";

import {
  createTokenProvenance,
  TOKEN_SOURCE_KINDS,
  TokenProvenanceSchema,
  type TokenSourceKind,
  TokenSourceKindSchema,
} from "./provenance.js";

describe("TOKEN_SOURCE_KINDS", () => {
  it("includes the five framework-agnostic source kinds", () => {
    const expected: TokenSourceKind[] = [
      "tailwind-v3-config",
      "tailwind-v4-theme",
      "css-custom-property",
      "css-modules-value",
      "adapter-hint",
    ];
    expect([...TOKEN_SOURCE_KINDS]).toEqual(expected);
  });

  it("is not Tailwind-only (includes non-Tailwind sources)", () => {
    // The registry MUST accept CSS custom properties, CSS Modules values, and
    // adapter hints — not just Tailwind.
    expect(TOKEN_SOURCE_KINDS).toContain("css-custom-property");
    expect(TOKEN_SOURCE_KINDS).toContain("css-modules-value");
    expect(TOKEN_SOURCE_KINDS).toContain("adapter-hint");
  });
});

describe("TokenSourceKindSchema", () => {
  it("accepts every declared kind", () => {
    for (const kind of TOKEN_SOURCE_KINDS) {
      expect(TokenSourceKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects an unknown source kind", () => {
    expect(TokenSourceKindSchema.safeParse("scss-variable").success).toBe(false);
    expect(TokenSourceKindSchema.safeParse("tailwind").success).toBe(false);
  });
});

describe("TokenProvenanceSchema", () => {
  it("accepts a minimal record with only the kind", () => {
    const result = TokenProvenanceSchema.safeParse({ kind: "css-custom-property" });
    expect(result.success).toBe(true);
  });

  it("accepts a config-file origin with path and line", () => {
    const result = TokenProvenanceSchema.safeParse({
      kind: "tailwind-v3-config",
      sourcePath: "tailwind.config.ts",
      sourceLine: 12,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an adapter hint with adapter id", () => {
    const result = TokenProvenanceSchema.safeParse({
      kind: "adapter-hint",
      adapterId: "vue-scoped",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a record without a kind", () => {
    expect(TokenProvenanceSchema.safeParse({ sourcePath: "x.css" }).success).toBe(false);
  });

  it("rejects a non-positive source line", () => {
    expect(
      TokenProvenanceSchema.safeParse({ kind: "css-custom-property", sourceLine: 0 }).success,
    ).toBe(false);
    expect(
      TokenProvenanceSchema.safeParse({ kind: "css-custom-property", sourceLine: -1 }).success,
    ).toBe(false);
  });
});

describe("createTokenProvenance", () => {
  it("round-trips a valid record", () => {
    const p = createTokenProvenance({
      kind: "tailwind-v4-theme",
      sourcePath: "src/app.css",
      sourceLine: 5,
    });
    expect(p.kind).toBe("tailwind-v4-theme");
    expect(p.sourcePath).toBe("src/app.css");
    expect(p.sourceLine).toBe(5);
  });

  it("throws on an invalid kind (malformed-input defense)", () => {
    expect(() => createTokenProvenance({ kind: "telepathy" as never })).toThrow();
  });
});

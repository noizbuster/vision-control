/**
 * Design-token category tests (VC-V1V2-18) — TDD-first.
 */
import { describe, expect, it } from "vitest";

import {
  isTypographyCategory,
  TOKEN_CATEGORIES,
  type TokenCategory,
  TokenCategorySchema,
} from "./categories.js";

describe("TOKEN_CATEGORIES", () => {
  it("includes the core categories named in the brief", () => {
    // The brief lists spacing, color, typography, radius, shadow, z-index,
    // transition. Typography is split into its concrete sub-categories.
    for (const required of [
      "spacing",
      "color",
      "fontSize",
      "fontFamily",
      "radius",
      "shadow",
      "z-index",
      "transition",
      "unknown",
    ] as const) {
      expect(TOKEN_CATEGORIES).toContain(required);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(TOKEN_CATEGORIES).size).toBe(TOKEN_CATEGORIES.length);
  });
});

describe("TokenCategorySchema", () => {
  it("accepts every member of the const tuple", () => {
    for (const category of TOKEN_CATEGORIES) {
      expect(TokenCategorySchema.safeParse(category).success).toBe(true);
    }
  });

  it("rejects an unknown category (malformed-input guard)", () => {
    expect(TokenCategorySchema.safeParse("bogus").success).toBe(false);
    expect(TokenCategorySchema.safeParse("").success).toBe(false);
    expect(TokenCategorySchema.safeParse(42).success).toBe(false);
  });

  it("rejects a category-like string not in the enum", () => {
    // "gap" is a utility, not a category.
    expect(TokenCategorySchema.safeParse("gap").success).toBe(false);
  });
});

describe("isTypographyCategory", () => {
  it("returns true for font-size, font-family, font-weight, line-height", () => {
    const typography: TokenCategory[] = ["fontSize", "fontFamily", "fontWeight", "lineHeight"];
    for (const cat of typography) {
      expect(isTypographyCategory(cat)).toBe(true);
    }
  });

  it("returns false for spacing, color, radius, shadow, unknown", () => {
    for (const cat of ["spacing", "color", "radius", "shadow", "unknown"] as const) {
      expect(isTypographyCategory(cat)).toBe(false);
    }
  });
});

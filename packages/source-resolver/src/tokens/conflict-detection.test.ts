/**
 * Token conflict-detection tests (VC-V1V2-18) — TDD-first.
 */
import { describe, expect, it } from "vitest";

import {
  detectTokenConflicts,
  formatConflictWarning,
  TOKEN_CONFLICT_WARNING_CODE,
} from "./conflict-detection.js";
import { createDesignToken } from "./registry.js";

const tok = (
  name: string,
  value: string,
  kind: "tailwind-v3-config" | "css-custom-property" | "adapter-hint" = "tailwind-v3-config",
) =>
  createDesignToken({
    name,
    category: "spacing",
    value,
    provenance: { kind },
  });

describe("detectTokenConflicts", () => {
  it("returns no conflicts when all sources agree", () => {
    const tokens = [tok("gap-2", "0.5rem"), tok("gap-2", "0.5rem", "css-custom-property")];
    expect(detectTokenConflicts(tokens)).toEqual([]);
  });

  it("detects a conflict when two sources disagree on value", () => {
    const tokens = [tok("gap-2", "0.5rem"), tok("gap-2", "0.75rem", "css-custom-property")];
    const conflicts = detectTokenConflicts(tokens);
    expect(conflicts).toHaveLength(1);
    const first = conflicts[0];
    expect(first?.name).toBe("gap-2");
    expect(first && [...first.distinctValues].sort()).toEqual(["0.5rem", "0.75rem"]);
    expect(first && [...first.sources.map((s) => s.kind)].sort()).toEqual([
      "css-custom-property",
      "tailwind-v3-config",
    ]);
  });

  it("returns one conflict per conflicting name, in insertion order", () => {
    const tokens = [
      tok("gap-2", "0.5rem"),
      tok("gap-2", "0.75rem"),
      tok("gap-4", "1rem"),
      tok("gap-4", "2rem", "css-custom-property"),
    ];
    const conflicts = detectTokenConflicts(tokens);
    expect(conflicts.map((c) => c.name)).toEqual(["gap-2", "gap-4"]);
  });

  it("ignores non-conflicting names entirely", () => {
    const tokens = [
      tok("gap-2", "0.5rem"),
      tok("gap-2", "0.5rem", "css-custom-property"), // agree
      tok("gap-4", "1rem"),
      tok("gap-8", "2rem"),
      tok("gap-8", "3rem", "css-custom-property"), // conflict
    ];
    const conflicts = detectTokenConflicts(tokens);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.name).toBe("gap-8");
  });

  it("returns an empty array for an empty input", () => {
    expect(detectTokenConflicts([])).toEqual([]);
  });

  it("reports the category from the first registration", () => {
    const tokens = [
      createDesignToken({
        name: "primary",
        category: "color",
        value: "#f00",
        provenance: { kind: "css-custom-property" },
      }),
      createDesignToken({
        name: "primary",
        category: "color",
        value: "#00f",
        provenance: { kind: "adapter-hint", adapterId: "vue" },
      }),
    ];
    const conflicts = detectTokenConflicts(tokens);
    const first = conflicts[0];
    expect(first?.category).toBe("color");
  });
});

describe("formatConflictWarning", () => {
  it("produces a readable message with values and source kinds", () => {
    const conflicts = detectTokenConflicts([
      tok("gap-2", "0.5rem"),
      tok("gap-2", "0.75rem", "css-custom-property"),
    ]);
    const first = conflicts[0];
    if (first === undefined) throw new Error("expected a conflict");
    const msg = formatConflictWarning(first);
    expect(msg).toContain("gap-2");
    expect(msg).toContain("0.5rem");
    expect(msg).toContain("0.75rem");
    expect(msg).toContain("tailwind-v3-config");
    expect(msg).toContain("css-custom-property");
  });
});

describe("TOKEN_CONFLICT_WARNING_CODE", () => {
  it("is a stable string", () => {
    expect(TOKEN_CONFLICT_WARNING_CODE).toBe("token-conflict");
  });
});

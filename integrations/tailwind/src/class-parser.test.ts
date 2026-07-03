/**
 * className parser tests (VC-V1V2-11) — TDD-first.
 *
 * Defines how a Tailwind v3 className string splits into utility, value,
 * variant prefix, and arbitrary value before the adapter implementation lands.
 */
import { describe, expect, it } from "vitest";

import { parseClassName } from "./class-parser.js";

describe("parseClassName — bare utilities (no value)", () => {
  it("parses a bare display utility", () => {
    expect(parseClassName("flex")).toEqual({
      raw: "flex",
      utility: "flex",
      negative: false,
      variants: [],
    });
  });

  it("parses bare position utilities", () => {
    expect(parseClassName("relative")?.utility).toBe("relative");
    expect(parseClassName("absolute")?.utility).toBe("absolute");
    expect(parseClassName("hidden")?.utility).toBe("hidden");
  });
});

describe("parseClassName — utility + scale value", () => {
  it("parses gap-2 into utility gap and value 2", () => {
    const parsed = parseClassName("gap-2");
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.value).toBe("2");
    expect(parsed?.variants).toEqual([]);
    expect(parsed?.negative).toBe(false);
  });

  it("parses a multi-word utility with a value (items-center vs flex-col)", () => {
    // items-center is a bare utility (no scale value) — center is part of the name
    expect(parseClassName("items-center")?.utility).toBe("items-center");
    // flex-col is bare too
    expect(parseClassName("flex-col")?.utility).toBe("flex-col");
  });

  it("parses a spacing utility with a fractional scale key (p-1.5)", () => {
    const parsed = parseClassName("p-1.5");
    expect(parsed?.utility).toBe("p");
    expect(parsed?.value).toBe("1.5");
  });

  it("parses a color utility with a named scale key (text-red-500)", () => {
    const parsed = parseClassName("text-red-500");
    expect(parsed?.utility).toBe("text");
    expect(parsed?.value).toBe("red-500");
  });

  it("parses a fontSize utility (text-lg)", () => {
    const parsed = parseClassName("text-lg");
    expect(parsed?.utility).toBe("text");
    expect(parsed?.value).toBe("lg");
  });
});

describe("parseClassName — negative utilities", () => {
  it("parses -mt-2 as negative mt with value 2", () => {
    const parsed = parseClassName("-mt-2");
    expect(parsed?.utility).toBe("mt");
    expect(parsed?.value).toBe("2");
    expect(parsed?.negative).toBe(true);
  });

  it("parses -translate-x-4 (negative translate)", () => {
    const parsed = parseClassName("-translate-x-4");
    expect(parsed?.utility).toBe("translate-x");
    expect(parsed?.value).toBe("4");
    expect(parsed?.negative).toBe(true);
  });
});

describe("parseClassName — responsive and state variants", () => {
  it("parses a single responsive variant prefix (md:gap-2)", () => {
    const parsed = parseClassName("md:gap-2");
    expect(parsed?.variants).toEqual(["md"]);
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.value).toBe("2");
  });

  it("parses a single state variant prefix (hover:gap-2)", () => {
    const parsed = parseClassName("hover:gap-2");
    expect(parsed?.variants).toEqual(["hover"]);
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.value).toBe("2");
  });

  it("parses stacked responsive + state variants (md:hover:gap-2)", () => {
    const parsed = parseClassName("md:hover:gap-2");
    expect(parsed?.variants).toEqual(["md", "hover"]);
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.value).toBe("2");
  });

  it("parses lg:focus:bg-blue-500 (three-segment variant chain)", () => {
    const parsed = parseClassName("lg:focus:bg-blue-500");
    expect(parsed?.variants).toEqual(["lg", "focus"]);
    expect(parsed?.utility).toBe("bg");
    expect(parsed?.value).toBe("blue-500");
  });
});

describe("parseClassName — arbitrary values", () => {
  it("parses an arbitrary spacing value (gap-[12px])", () => {
    const parsed = parseClassName("gap-[12px]");
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.arbitrary).toBe("12px");
    expect(parsed?.value).toBeUndefined();
    expect(parsed?.variants).toEqual([]);
  });

  it("parses an arbitrary value with a variant prefix (md:gap-[12px])", () => {
    const parsed = parseClassName("md:gap-[12px]");
    expect(parsed?.variants).toEqual(["md"]);
    expect(parsed?.utility).toBe("gap");
    expect(parsed?.arbitrary).toBe("12px");
  });

  it("parses an arbitrary color value (bg-[#1da1f2])", () => {
    const parsed = parseClassName("bg-[#1da1f2]");
    expect(parsed?.utility).toBe("bg");
    expect(parsed?.arbitrary).toBe("#1da1f2");
  });

  it("parses an arbitrary value containing a colon (grid-cols-[repeat(3,minmax(0,1fr))])", () => {
    // Arbitrary values may contain characters that look like variant separators.
    const parsed = parseClassName("grid-cols-[repeat(3,minmax(0,1fr))]");
    expect(parsed?.variants).toEqual([]);
    expect(parsed?.utility).toBe("grid-cols");
    expect(parsed?.arbitrary).toBe("repeat(3,minmax(0,1fr))");
  });
});

describe("parseClassName — malformed / non-tailwind input", () => {
  it("returns null for an empty string", () => {
    expect(parseClassName("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parseClassName("   ")).toBeNull();
  });

  it("returns null for a string with only variant separators", () => {
    expect(parseClassName(":::")).toBeNull();
  });

  it("returns a parsed object for a plain word that is not a real utility (parser is structural, not a token whitelist)", () => {
    // The parser is structural: it splits; the registry decides whether the
    // utility is a known Tailwind token. "nonsense" parses as a bare utility.
    const parsed = parseClassName("nonsense");
    expect(parsed?.utility).toBe("nonsense");
    expect(parsed?.variants).toEqual([]);
  });
});

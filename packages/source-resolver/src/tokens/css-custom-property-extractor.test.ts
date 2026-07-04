/**
 * CSS custom-property extractor tests (VC-V1V2-18 / task 9).
 *
 * Locks the pure extractor: `:root` block parsing, category inference by name
 * prefix, provenance shape, and malformed-input defense (empty file, no
 * `:root`, unclosed brace → empty, never a throw).
 */
import { describe, expect, it } from "vitest";
import { extractCssCustomProperties } from "./css-custom-property-extractor.js";

describe("extractCssCustomProperties — happy path", () => {
  it("extracts spacing/color/font custom properties from a :root block", () => {
    const css = `
      :root {
        --color-brand: #123456;
        --spacing-page: 2rem;
        --font-sans: Inter, system-ui, sans-serif;
      }
    `;
    const tokens = extractCssCustomProperties(css, "src/tokens.css");
    const names = tokens.map((t) => t.name);
    expect(names).toContain("--color-brand");
    expect(names).toContain("--spacing-page");
    expect(names).toContain("--font-sans");
    const brand = tokens.find((t) => t.name === "--color-brand");
    expect(brand?.category).toBe("color");
    expect(brand?.value).toBe("#123456");
    expect(brand?.provenance.kind).toBe("css-custom-property");
    expect(brand?.provenance.sourcePath).toBe("src/tokens.css");
  });

  it("computes px for spacing tokens and leaves non-spacing px undefined", () => {
    const tokens = extractCssCustomProperties(
      ":root { --spacing-2: 0.5rem; --color-x: #fff; }",
      "a.css",
    );
    const spacing = tokens.find((t) => t.name === "--spacing-2");
    expect(spacing?.px).toBe(8);
    const color = tokens.find((t) => t.name === "--color-x");
    expect(color?.px).toBeUndefined();
  });

  it("infers categories from the v4-style namespace prefixes", () => {
    const tokens = extractCssCustomProperties(
      ":root { --text-lg: 1.125rem; --radius-md: 0.375rem; --font-weight-bold: 700; }",
      "a.css",
    );
    expect(tokens.find((t) => t.name === "--text-lg")?.category).toBe("fontSize");
    expect(tokens.find((t) => t.name === "--radius-md")?.category).toBe("radius");
    expect(tokens.find((t) => t.name === "--font-weight-bold")?.category).toBe("fontWeight");
  });

  it("marks unrecognised prefixes as unknown (never drops, never guesses)", () => {
    const tokens = extractCssCustomProperties(":root { --random-thing: 42px; }", "a.css");
    const token = tokens.find((t) => t.name === "--random-thing");
    expect(token?.category).toBe("unknown");
  });
});

describe("extractCssCustomProperties — malformed input defense", () => {
  it("returns an empty array for a file with no :root block", () => {
    const tokens = extractCssCustomProperties(".btn { color: red; }", "a.css");
    expect(tokens).toHaveLength(0);
  });

  it("returns an empty array for an empty input", () => {
    expect(extractCssCustomProperties("", "a.css")).toHaveLength(0);
  });

  it("does not throw on an unclosed :root brace", () => {
    const tokens = extractCssCustomProperties(":root { --color-x: #fff;", "a.css");
    // The scan window extends to end-of-string; the token is still captured.
    expect(tokens.some((t) => t.name === "--color-x")).toBe(true);
  });

  it("skips declarations with an empty value", () => {
    const tokens = extractCssCustomProperties(":root { --empty: ; --color-x: #fff; }", "a.css");
    expect(tokens.some((t) => t.name === "--empty")).toBe(false);
    expect(tokens.some((t) => t.name === "--color-x")).toBe(true);
  });

  it("extracts from multiple :root blocks in one file", () => {
    const css = `
      :root { --color-a: #111; }
      :root { --color-b: #222; }
    `;
    const tokens = extractCssCustomProperties(css, "a.css");
    expect(tokens.map((t) => t.name).sort()).toEqual(["--color-a", "--color-b"]);
  });
});

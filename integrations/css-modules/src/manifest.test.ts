/**
 * Tests for CSS Modules manifest parsing (VC-V1V2-12, TDD-first).
 *
 * Covers css-loader output (webpack/Next.js), Vite output, composed classes
 * (space-separated hashes), malformed input, and stale manifest detection.
 */
import { describe, expect, it } from "vitest";

import { parseManifest, parseManifestJson } from "./manifest.js";

describe("parseManifest — css-loader format (webpack / Next.js)", () => {
  it("parses a single-module single-class manifest and supports reverse lookup", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_ab12cd" },
    });
    expect(manifest.format).toBe("css-loader");
    expect(manifest.entries).toHaveLength(1);
    const entry = manifest.entries[0];
    expect(entry?.modulePath).toBe("src/Button.module.css");
    expect(entry?.localName).toBe("button");
    expect(entry?.hashedName).toBe("_button_ab12cd");
    expect(entry?.composedHashes).toEqual(["_button_ab12cd"]);

    const found = manifest.lookupByHash("_button_ab12cd");
    expect(found).toHaveLength(1);
    expect(found[0]?.localName).toBe("button");
  });

  it("parses a multi-module manifest and keeps entries distinct", () => {
    const manifest = parseManifest({
      "src/Button.module.css": { button: "_button_aaa", container: "_container_bbb" },
      "src/Card.module.css": { card: "_card_ccc" },
    });
    expect(manifest.entries).toHaveLength(3);
    expect(manifest.lookupByHash("_button_aaa")).toHaveLength(1);
    expect(manifest.lookupByHash("_container_bbb")).toHaveLength(1);
    expect(manifest.lookupByHash("_card_ccc")).toHaveLength(1);
  });

  it("handles namespaced css-loader names (File_name__hash)", () => {
    const manifest = parseManifest({
      "Button.module.css": { root: "Button_root__1a2b3c" },
    });
    expect(manifest.lookupByHash("Button_root__1a2b3c")).toHaveLength(1);
    expect(manifest.lookupByHash("Button_root__1a2b3c")[0]?.localName).toBe("root");
  });
});

describe("parseManifest — Vite format", () => {
  it("parses a Vite-style manifest with underscore convention", () => {
    const manifest = parseManifest({
      "/src/components/Button.module.css": { button: "_button_1a2b3c4d" },
    });
    expect(manifest.entries).toHaveLength(1);
    const found = manifest.lookupByHash("_button_1a2b3c4d");
    expect(found[0]?.localName).toBe("button");
    expect(found[0]?.modulePath).toBe("/src/components/Button.module.css");
  });
});

describe("parseManifest — composed classes (space-separated hashes)", () => {
  it("splits a composed hash value into individual composedHashes", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        button: "_base_1a2b _button_3c4d",
      },
    });
    const entry = manifest.entries[0];
    expect(entry?.composedHashes).toEqual(["_base_1a2b", "_button_3c4d"]);
    expect(entry?.hashedName).toBe("_base_1a2b");
  });

  it("indexes ALL composed hashes for reverse lookup", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        button: "_base_1a2b _button_3c4d",
      },
    });
    expect(manifest.lookupByHash("_base_1a2b")).toHaveLength(1);
    expect(manifest.lookupByHash("_button_3c4d")).toHaveLength(1);
  });

  it("handles three-way composition", () => {
    const manifest = parseManifest({
      "src/Complex.module.css": {
        complex: "_a_111 _b_222 _c_333",
      },
    });
    const entry = manifest.entries[0];
    expect(entry?.composedHashes).toHaveLength(3);
    expect(manifest.lookupByHash("_b_222")).toHaveLength(1);
    expect(manifest.lookupByHash("_c_333")).toHaveLength(1);
  });
});

describe("parseManifest — malformed input (graceful degradation)", () => {
  it("returns an empty manifest for null", () => {
    const manifest = parseManifest(null);
    expect(manifest.isEmpty).toBe(true);
    expect(manifest.format).toBe("unknown");
  });

  it("returns an empty manifest for a non-object primitive", () => {
    expect(parseManifest(42).isEmpty).toBe(true);
    expect(parseManifest("hello").isEmpty).toBe(true);
    expect(parseManifest(true).isEmpty).toBe(true);
  });

  it("returns an empty manifest for an array", () => {
    expect(parseManifest([{ button: "_button_ab12cd" }]).isEmpty).toBe(true);
  });

  it("skips entries whose value is not a string", () => {
    const manifest = parseManifest({
      "src/Button.module.css": {
        button: "_button_ab12cd",
        bad: 123,
        worse: null,
      },
    });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.localName).toBe("button");
  });

  it("skips entries whose nested value is not an object", () => {
    const manifest = parseManifest({
      "src/Button.module.css": "not-an-object",
      "src/Good.module.css": { good: "_good_ab12cd" },
    });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.localName).toBe("good");
  });
});

describe("parseManifestJson", () => {
  it("parses a valid JSON string", () => {
    const json = JSON.stringify({ "src/Button.module.css": { button: "_button_ab12cd" } });
    const manifest = parseManifestJson(json);
    expect(manifest.entries).toHaveLength(1);
  });

  it("returns an empty manifest for malformed JSON", () => {
    const manifest = parseManifestJson("{ this is not valid json ]");
    expect(manifest.isEmpty).toBe(true);
    expect(manifest.format).toBe("unknown");
  });
});

describe("CssModulesManifest — lookup for unknown hash", () => {
  it("returns an empty array for a hash not in the manifest", () => {
    const manifest = parseManifest({ "src/Button.module.css": { button: "_button_ab12cd" } });
    expect(manifest.lookupByHash("_nonexistent_xyz")).toEqual([]);
  });
});

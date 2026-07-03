import { describe, expect, it } from "vitest";

import { PACKAGE_NAME as _PKG, VANILLA_CSS_ADAPTER } from "./index.js";

// PACKAGE_NAME is re-exported via the barrel; keep it importable.
void _PKG;

describe("vanilla-css barrel", () => {
  it("exports a VANILLA_CSS_ADAPTER with the correct id", () => {
    expect(VANILLA_CSS_ADAPTER.id).toBe("vanilla-css");
  });

  it("the bare singleton returns no candidates (defers to other cascades)", () => {
    expect(VANILLA_CSS_ADAPTER.resolve({ cssClasses: ["btn"] })).toEqual([]);
  });

  it("compiles the barrel re-exports", () => {
    expect(true).toBe(true);
  });
});

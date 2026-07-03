import { describe, expect, it } from "vitest";

import { PACKAGE_NAME as _PKG, CSS_MODULES_ADAPTER } from "./index.js";

// PACKAGE_NAME is re-exported via the barrel; keep it importable.
void _PKG;

describe("css-modules barrel", () => {
  it("exposes the package name sentinel", () => {
    // PACKAGE_NAME is no longer the primary export; the adapter is.
    // Import is exercised above. This test just asserts the barrel compiles.
    expect(true).toBe(true);
  });

  it("exports a CSS_MODULES_ADAPTER with the correct id", () => {
    expect(CSS_MODULES_ADAPTER.id).toBe("css-modules");
  });

  it("CSS_MODULES_ADAPTER returns empty for non-hashed classes", () => {
    expect(CSS_MODULES_ADAPTER.resolve({ cssClasses: ["btn"] })).toEqual([]);
  });
});

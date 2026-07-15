import { describe, expect, it } from "vitest";

/**
 * Turbopack fixture note after marker-plugin deletion (ADR-019 C7).
 * Marker injection is no longer a product path.
 */
describe("playground-next turbopack fixture (no marker plugin)", () => {
  it("documents that marker HIGH is not a product path", () => {
    expect(true).toBe(true);
  });
});

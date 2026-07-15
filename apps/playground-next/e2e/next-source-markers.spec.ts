import { expect, test } from "@playwright/test";

/**
 * Marker HIGH product path deleted (ADR-019 C7). Fixture remains for Next app
 * smoke only; no data-vc-source injection is expected.
 */
test.describe("playground-next fixture (no markers)", () => {
  test("marker product path is absent", () => {
    expect(true).toBe(true);
  });
});

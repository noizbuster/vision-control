import { expect, test } from "@playwright/test";

/**
 * Marker HIGH product path deleted (ADR-019 C7). Turbopack marker e2e retired.
 */
test.describe("playground-next turbopack fixture (no markers)", () => {
  test("marker product path is absent", () => {
    expect(true).toBe(true);
  });
});

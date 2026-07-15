import { describe, expect, it } from "vitest";

/**
 * Fixture smoke tests after marker-plugin deletion (ADR-019 C7).
 * Marker HIGH product path is gone; playground-next remains a plain Next fixture.
 */
describe("playground-next fixture (no marker plugin)", () => {
  it("next config is a plain object without marker wrapper", async () => {
    const config = await import("../next.config.mjs");
    expect(config.default).toBeDefined();
    expect(config.default).toMatchObject({ reactStrictMode: true });
    expect(config.default).not.toHaveProperty("webpack");
  });
});

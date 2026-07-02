import { describe, expect, it } from "vitest";
import { PLACEHOLDER } from "./index.js";

describe("protocol-placeholder", () => {
  it("exposes the placeholder sentinel", () => {
    expect(PLACEHOLDER).toBe("vision-control:protocol-placeholder");
  });
});

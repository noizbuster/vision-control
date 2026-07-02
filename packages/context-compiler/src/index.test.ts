import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("context-compiler", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/context-compiler");
  });
});

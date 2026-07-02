import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("playground-react-vite", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/playground-react-vite");
  });
});

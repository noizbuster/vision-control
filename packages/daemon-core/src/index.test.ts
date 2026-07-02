import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("daemon-core barrel", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/daemon-core");
  });
});

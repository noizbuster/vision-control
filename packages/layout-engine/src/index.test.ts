import { describe, expect, it } from "vitest";

import {
  classifyLayoutRole,
  classifySemanticIntent,
  computeInsertionIndex,
  generateResizeCandidates,
  isValidChild,
  PACKAGE_NAME,
  validateReparent,
} from "./index.js";

describe("layout-engine public API", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/layout-engine");
  });

  it("all primary entry points are reachable through the barrel", () => {
    expect(typeof classifyLayoutRole).toBe("function");
    expect(typeof computeInsertionIndex).toBe("function");
    expect(typeof isValidChild).toBe("function");
    expect(typeof validateReparent).toBe("function");
    expect(typeof generateResizeCandidates).toBe("function");
    expect(typeof classifySemanticIntent).toBe("function");
  });
});

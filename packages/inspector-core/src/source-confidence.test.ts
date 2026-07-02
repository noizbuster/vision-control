import { describe, expect, it } from "vitest";

import { computeSourceConfidence } from "./index.js";

describe("source confidence", () => {
  it("returns high when a data-vc-source attribute is present", () => {
    const result = computeSourceConfidence({
      attributes: { "data-vc-source": "src/Button.tsx:12" },
      id: "",
      className: "",
      role: undefined,
      selector: "",
    });
    expect(result).toBe("high");
  });

  it("returns medium for a stable id or role", () => {
    expect(
      computeSourceConfidence({
        attributes: {},
        id: "header",
        className: "",
        role: undefined,
        selector: "",
      }),
    ).toBe("medium");

    expect(
      computeSourceConfidence({
        attributes: {},
        id: "",
        className: "",
        role: "navigation",
        selector: "",
      }),
    ).toBe("medium");
  });

  it("returns low for volatile-only data", () => {
    const result = computeSourceConfidence({
      attributes: {},
      id: "",
      className: "",
      role: undefined,
      selector: "body > div:nth-child(1)",
    });
    expect(result).toBe("low");
  });
});

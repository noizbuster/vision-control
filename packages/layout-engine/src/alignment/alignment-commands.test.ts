import { describe, expect, it } from "vitest";

import {
  ALIGNMENT_COMMANDS,
  type AlignmentCommandKind,
  alignmentFlexValue,
  commandAlignmentAxis,
  commandLabel,
  isHorizontalAlignment,
  isVerticalAlignment,
  MATCH_AXES,
  type MatchAxis,
} from "./alignment-commands.js";

describe("alignment-commands — taxonomy", () => {
  it("exposes exactly ten alignment/distribution commands", () => {
    expect(ALIGNMENT_COMMANDS).toHaveLength(10);
  });

  it("includes the six snap-alignment commands", () => {
    for (const kind of [
      "align-left",
      "align-center",
      "align-right",
      "align-top",
      "align-middle",
      "align-bottom",
    ] as AlignmentCommandKind[]) {
      expect(ALIGNMENT_COMMANDS).toContain(kind);
    }
  });

  it("includes both distribution commands", () => {
    expect(ALIGNMENT_COMMANDS).toContain("distribute-horizontal");
    expect(ALIGNMENT_COMMANDS).toContain("distribute-vertical");
  });

  it("includes equal-gap and match-size", () => {
    expect(ALIGNMENT_COMMANDS).toContain("equal-gap");
    expect(ALIGNMENT_COMMANDS).toContain("match-size");
  });

  it("exposes width and height match axes", () => {
    expect(MATCH_AXES).toEqual(["width", "height"]);
  });
});

describe("alignment-commands — axis classification", () => {
  it("classifies horizontal alignment commands", () => {
    expect(commandAlignmentAxis("align-left")).toBe("horizontal");
    expect(commandAlignmentAxis("align-center")).toBe("horizontal");
    expect(commandAlignmentAxis("align-right")).toBe("horizontal");
    expect(isHorizontalAlignment("align-center")).toBe(true);
    expect(isVerticalAlignment("align-center")).toBe(false);
  });

  it("classifies vertical alignment commands", () => {
    expect(commandAlignmentAxis("align-top")).toBe("vertical");
    expect(commandAlignmentAxis("align-middle")).toBe("vertical");
    expect(commandAlignmentAxis("align-bottom")).toBe("vertical");
    expect(isVerticalAlignment("align-middle")).toBe(true);
    expect(isHorizontalAlignment("align-middle")).toBe(false);
  });

  it("classifies distribution commands by their named axis", () => {
    expect(commandAlignmentAxis("distribute-horizontal")).toBe("horizontal");
    expect(commandAlignmentAxis("distribute-vertical")).toBe("vertical");
  });
});

describe("alignment-commands — flex value mapping", () => {
  it("maps start-edge commands to flex-start", () => {
    expect(alignmentFlexValue("align-left")).toBe("flex-start");
    expect(alignmentFlexValue("align-top")).toBe("flex-start");
  });

  it("maps center commands to center", () => {
    expect(alignmentFlexValue("align-center")).toBe("center");
    expect(alignmentFlexValue("align-middle")).toBe("center");
  });

  it("maps end-edge commands to flex-end", () => {
    expect(alignmentFlexValue("align-right")).toBe("flex-end");
    expect(alignmentFlexValue("align-bottom")).toBe("flex-end");
  });

  it("returns null for non-snap commands", () => {
    expect(alignmentFlexValue("distribute-horizontal")).toBeNull();
    expect(alignmentFlexValue("equal-gap")).toBeNull();
    expect(alignmentFlexValue("match-size")).toBeNull();
  });
});

describe("alignment-commands — labels", () => {
  it("returns a non-empty label for every command", () => {
    for (const kind of ALIGNMENT_COMMANDS) {
      const label = commandLabel(kind);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("alignment-commands — type narrowing", () => {
  it("MatchAxis is width or height (compile-time guard)", () => {
    const axis: MatchAxis = "width";
    expect(axis).toBe("width");
  });
});

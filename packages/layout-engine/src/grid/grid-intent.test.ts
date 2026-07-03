import { describe, expect, it } from "vitest";

import { type GridIntentInput, resolveGridIntent } from "./grid-intent.js";

const base = (over: Partial<GridIntentInput>): GridIntentInput => ({
  userChoice: "unset",
  fromIndex: 0,
  toIndex: 1,
  newGridArea: "1 / 2 / 2 / 3",
  accessibilitySemanticMatch: true,
  visualMatchesReadingOrder: false,
  ...over,
});

describe("resolveGridIntent — the no-silent-DOM-rewrite guard (misleading_success_output)", () => {
  // PRD constraint / open question 9: a grid visual reorder must NEVER silently
  // rewrite DOM order. With no explicit user choice, the resolution must be a
  // grid-area placement (or rejected), never a dom-order rewrite.
  it("does NOT produce a dom-order intent when userChoice is unset", () => {
    const resolution = resolveGridIntent(base({ userChoice: "unset" }));
    expect(resolution.kind).not.toBe("dom-order");
  });

  it("resolves an unset choice to grid-area placement (visual move, DOM untouched)", () => {
    const resolution = resolveGridIntent(base({ userChoice: "unset" }));
    expect(resolution.kind).toBe("grid-area");
  });

  it("never returns an absolute-positioning instruction for any choice", () => {
    for (const choice of ["unset", "dom-order", "grid-area"] as const) {
      const resolution = resolveGridIntent(base({ userChoice: choice }));
      if (resolution.kind === "grid-area" || resolution.kind === "dom-order") {
        expect(resolution.a11yWarning ?? "").not.toMatch(/position:\s*absolute/i);
      }
    }
  });
});

describe("resolveGridIntent — explicit dom-order choice", () => {
  it("produces a dom-order intent when a11y/source semantics match", () => {
    const resolution = resolveGridIntent(
      base({ userChoice: "dom-order", accessibilitySemanticMatch: true }),
    );
    expect(resolution.kind).toBe("dom-order");
    if (resolution.kind === "dom-order") {
      expect(resolution.fromIndex).toBe(0);
      expect(resolution.toIndex).toBe(1);
      expect(resolution.a11yWarning).toBeNull();
    }
  });

  it("REJECTS a dom-order choice when accessibility/source semantics do NOT match", () => {
    const resolution = resolveGridIntent(
      base({ userChoice: "dom-order", accessibilitySemanticMatch: false }),
    );
    expect(resolution.kind).toBe("rejected");
    if (resolution.kind === "rejected") {
      expect(resolution.reason).toMatch(/accessibility|semantics/i);
    }
  });
});

describe("resolveGridIntent — explicit grid-area choice", () => {
  it("produces a grid-area intent carrying previous + new areas", () => {
    const resolution = resolveGridIntent(
      base({
        userChoice: "grid-area",
        previousGridArea: "1 / 1 / 2 / 2",
        newGridArea: "1 / 2 / 2 / 3",
      }),
    );
    expect(resolution.kind).toBe("grid-area");
    if (resolution.kind === "grid-area") {
      expect(resolution.previousGridArea).toBe("1 / 1 / 2 / 2");
      expect(resolution.newGridArea).toBe("1 / 2 / 2 / 3");
    }
  });

  it("surfaces an a11y warning when visual order differs from DOM reading order", () => {
    const resolution = resolveGridIntent(
      base({ userChoice: "grid-area", visualMatchesReadingOrder: false }),
    );
    expect(resolution.kind).toBe("grid-area");
    if (resolution.kind === "grid-area") {
      expect(resolution.a11yWarning).not.toBeNull();
      expect(resolution.a11yWarning).toMatch(/reading order|accessibility/i);
    }
  });

  it("carries no a11y warning when the visual order matches reading order", () => {
    const resolution = resolveGridIntent(
      base({ userChoice: "grid-area", visualMatchesReadingOrder: true }),
    );
    if (resolution.kind === "grid-area") {
      expect(resolution.a11yWarning).toBeNull();
    }
  });
});

describe("resolveGridIntent — malformed input", () => {
  it("rejects a dom-order choice with a non-positive fromIndex", () => {
    const resolution = resolveGridIntent(base({ userChoice: "dom-order", fromIndex: -1 }));
    expect(resolution.kind).toBe("rejected");
  });

  it("rejects a grid-area choice with an empty newGridArea", () => {
    const resolution = resolveGridIntent(base({ userChoice: "grid-area", newGridArea: "" }));
    expect(resolution.kind).toBe("rejected");
  });
});

import { describe, expect, it } from "vitest";
import {
  type AutoLayoutContainerContext,
  isAutoLayoutSupported,
  resolveAutoLayoutCandidate,
} from "./auto-layout-candidates.js";
import type { AutoLayoutCommand } from "./auto-layout-commands.js";

const flexRow: AutoLayoutContainerContext = {
  layoutRole: "flex-container",
  display: "flex",
  flexDirection: "row",
};
const flexColumn: AutoLayoutContainerContext = {
  layoutRole: "flex-container",
  display: "flex",
  flexDirection: "column",
};
const block: AutoLayoutContainerContext = {
  layoutRole: "normal-flow-block",
  display: "block",
  flexDirection: "row",
};
const grid: AutoLayoutContainerContext = {
  layoutRole: "grid-container",
  display: "grid",
  flexDirection: "row",
};
const inline: AutoLayoutContainerContext = {
  layoutRole: "inline",
  display: "inline",
  flexDirection: "row",
};
const unknown: AutoLayoutContainerContext = {
  layoutRole: "unknown",
  display: "",
  flexDirection: "row",
};

describe("isAutoLayoutSupported", () => {
  it("supports flex-container (row/column), normal-flow-block, and grid-container containers", () => {
    expect(isAutoLayoutSupported(flexRow)).toBe(true);
    expect(isAutoLayoutSupported(flexColumn)).toBe(true);
    expect(isAutoLayoutSupported(block)).toBe(true);
    expect(isAutoLayoutSupported(grid)).toBe(true);
  });

  it("rejects inline and inline-block containers", () => {
    expect(isAutoLayoutSupported(inline)).toBe(false);
    expect(isAutoLayoutSupported({ ...inline, layoutRole: "inline-block" })).toBe(false);
  });

  it("rejects unknown containers", () => {
    expect(isAutoLayoutSupported(unknown)).toBe(false);
  });
});

describe("resolveAutoLayoutCandidate — unsupported container diagnostic", () => {
  it("returns unsupported-container for an inline element with NO invalid CSS", () => {
    const result = resolveAutoLayoutCandidate({ kind: "set-direction", direction: "row" }, inline);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.diagnostic.kind).toBe("unsupported-container");
      expect(result.diagnostic.message).toMatch(/inline/);
    }
  });

  it("returns unsupported-container for an unknown container", () => {
    const result = resolveAutoLayoutCandidate({ kind: "set-gap", value: "1rem" }, unknown);
    expect(result.resolved).toBe(false);
  });

  it("returns unsupported-container for ANY command on an inline element", () => {
    const commands: AutoLayoutCommand[] = [
      { kind: "set-direction", direction: "row" },
      { kind: "set-gap", value: "1rem" },
      { kind: "set-padding", mode: "all", value: "8px" },
      { kind: "set-align-main", value: "center" },
      { kind: "set-align-cross", value: "stretch" },
      { kind: "set-wrap", value: "wrap" },
      { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
    ];
    for (const cmd of commands) {
      const result = resolveAutoLayoutCandidate(cmd, inline);
      expect(result.resolved).toBe(false);
    }
  });
});

describe("resolveAutoLayoutCandidate — container-level commands", () => {
  it("resolves set-direction to flex-direction", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-direction", direction: "column" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.kind).toBe("container-layout");
      if (result.candidates[0]?.kind === "container-layout") {
        expect(result.candidates[0].property).toBe("flex-direction");
        expect(result.candidates[0].value).toBe("column");
      }
    }
  });

  it("resolves set-gap without axis to uniform gap", () => {
    const result = resolveAutoLayoutCandidate({ kind: "set-gap", value: "1rem" }, flexRow);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      const c = result.candidates[0];
      expect(c?.kind).toBe("container-layout");
      if (c?.kind === "container-layout") {
        expect(c.property).toBe("gap");
        expect(c.value).toBe("1rem");
      }
    }
  });

  it("resolves set-gap with axis row to row-gap", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-gap", value: "8px", axis: "row" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "container-layout") {
      expect(result.candidates[0].property).toBe("row-gap");
    }
  });

  it("resolves set-gap with axis column to column-gap", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-gap", value: "8px", axis: "column" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "container-layout") {
      expect(result.candidates[0].property).toBe("column-gap");
    }
  });

  it("resolves set-padding mode all to a single padding shorthand", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-padding", mode: "all", value: "16px" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.candidates).toHaveLength(1);
      if (result.candidates[0]?.kind === "container-layout") {
        expect(result.candidates[0].property).toBe("padding");
      }
    }
  });

  it("resolves set-padding mode horizontal to left + right", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-padding", mode: "horizontal", value: "12px" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.candidates).toHaveLength(2);
      const props = result.candidates
        .map((c) => (c.kind === "container-layout" ? c.property : ""))
        .sort();
      expect(props).toEqual(["padding-left", "padding-right"]);
    }
  });

  it("resolves set-padding mode vertical to top + bottom", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-padding", mode: "vertical", value: "12px" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      const props = result.candidates
        .map((c) => (c.kind === "container-layout" ? c.property : ""))
        .sort();
      expect(props).toEqual(["padding-bottom", "padding-top"]);
    }
  });

  it("resolves set-padding mode individual to only the provided sides", () => {
    const result = resolveAutoLayoutCandidate(
      {
        kind: "set-padding",
        mode: "individual",
        value: "",
        sides: { top: "8px", left: "4px" },
      },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.candidates).toHaveLength(2);
      const props = result.candidates
        .map((c) => (c.kind === "container-layout" ? c.property : ""))
        .sort();
      expect(props).toEqual(["padding-left", "padding-top"]);
    }
  });

  it("resolves set-align-main to justify-content", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-align-main", value: "space-between" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "container-layout") {
      expect(result.candidates[0].property).toBe("justify-content");
      expect(result.candidates[0].value).toBe("space-between");
    }
  });

  it("resolves set-align-cross to align-items", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-align-cross", value: "stretch" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "container-layout") {
      expect(result.candidates[0].property).toBe("align-items");
    }
  });

  it("resolves set-wrap to flex-wrap", () => {
    const result = resolveAutoLayoutCandidate({ kind: "set-wrap", value: "wrap" }, flexRow);
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "container-layout") {
      expect(result.candidates[0].property).toBe("flex-wrap");
    }
  });
});

describe("resolveAutoLayoutCandidate — child sizing (context-sensitive)", () => {
  it("resolves set-child-sizing hug in a flex-row to a child-sizing candidate with flex declarations", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
      flexRow,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      const c = result.candidates[0];
      expect(c?.kind).toBe("child-sizing");
      if (c?.kind === "child-sizing") {
        expect(c.childIndex).toBe(0);
        expect(c.intent).toBe("hug");
        const props = c.declarations.map((d) => d.property);
        expect(props).toContain("flex");
        expect(props).toContain("width");
      }
    }
  });

  it("resolves set-child-sizing fill in a block container to width: 100% (different than flex)", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 1, intent: "fill" },
      block,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "child-sizing") {
      expect(result.candidates[0].childIndex).toBe(1);
      const width = result.candidates[0].declarations.find((d) => d.property === "width");
      expect(width?.value).toBe("100%");
      // Block fill does NOT use flex declarations
      expect(result.candidates[0].declarations.find((d) => d.property === "flex")).toBeUndefined();
    }
  });

  it("resolves set-child-sizing fixed with a value", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 2, intent: "fixed", value: "200px" },
      flexColumn,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "child-sizing") {
      const height = result.candidates[0].declarations.find((d) => d.property === "height");
      expect(height?.value).toBe("200px");
    }
  });

  it("returns a diagnostic for fixed intent without a value", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 0, intent: "fixed" },
      flexRow,
    );
    expect(result.resolved).toBe(false);
  });

  it("hug on a flex-row child differs from hug on a block child (context-sensitive)", () => {
    const flexResult = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
      flexRow,
    );
    const blockResult = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
      block,
    );
    expect(flexResult.resolved).toBe(true);
    expect(blockResult.resolved).toBe(true);
    if (flexResult.resolved && blockResult.resolved) {
      const flexC = flexResult.candidates[0];
      const blockC = blockResult.candidates[0];
      if (flexC?.kind === "child-sizing" && blockC?.kind === "child-sizing") {
        const flexProps = flexC.declarations
          .map((d) => d.property)
          .sort()
          .join(",");
        const blockProps = blockC.declarations
          .map((d) => d.property)
          .sort()
          .join(",");
        expect(flexProps).not.toBe(blockProps);
      }
    }
  });
});

describe("resolveAutoLayoutCandidate — grid container support", () => {
  it("supports container-level commands on grid", () => {
    const result = resolveAutoLayoutCandidate({ kind: "set-gap", value: "1rem" }, grid);
    expect(result.resolved).toBe(true);
  });

  it("supports child-sizing on grid items", () => {
    const result = resolveAutoLayoutCandidate(
      { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
      grid,
    );
    expect(result.resolved).toBe(true);
    if (result.resolved && result.candidates[0]?.kind === "child-sizing") {
      const props = result.candidates[0].declarations.map((d) => d.property);
      expect(props).toContain("justify-self");
    }
  });
});

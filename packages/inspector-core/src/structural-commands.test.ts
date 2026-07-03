import { computeInverse, type Operation, OperationSchema } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import { UnsupportedLayoutError } from "./command-errors.js";
import {
  createConvertLayoutToFlexCommand,
  createConvertLayoutToGridCommand,
  createDeleteCommand,
  createDuplicateCommand,
  createFlexContainerCommand,
  createGroupSelectionCommand,
  createMoveToBackCommand,
  createMoveToFrontCommand,
  createStackCommand,
  createUnwrapCommand,
  createWrapInContainerCommand,
} from "./structural-commands.js";

const timestamp = 1234567890123;
const ref = (id: string) => ({ runtimeId: id });

/** Parse through the discriminated union to prove the op is well-formed. */
const parses = (op: Operation): void => {
  const result = OperationSchema.safeParse(op);
  expect(result.success).toBe(true);
};

describe("duplicate command", () => {
  it("builds a duplicate-element op that parses", () => {
    const op = createDuplicateCommand(
      {
        source: ref("src-1"),
        duplicate: ref("copy-1"),
        parent: ref("parent-1"),
        index: 2,
        tagName: "div",
      },
      { id: "op-dup-0001", timestamp },
    );

    expect(op.kind).toBe("duplicate-element");
    expect(op.source.runtimeId).toBe("src-1");
    expect(op.duplicate.runtimeId).toBe("copy-1");
    expect(op.index).toBe(2);
    expect(op.tagName).toBe("div");
    expect(op.runtime).toBe(false);
    parses(op);
  });

  it("undo removes the copy, restoring a single instance", () => {
    const op = createDuplicateCommand(
      {
        source: ref("src-1"),
        duplicate: ref("copy-1"),
        parent: ref("parent-1"),
        index: 2,
        tagName: "div",
      },
      { id: "op-dup-0002", timestamp },
    );

    const inverse = computeInverse(op);

    // Undo of a duplicate is a remove-element that targets the COPY (duplicate),
    // leaving the original source untouched → single instance restored.
    expect(inverse.kind).toBe("remove-element");
    if (inverse.kind !== "remove-element") throw new Error("expected remove-element inverse");
    expect(inverse.element.runtimeId).toBe("copy-1");
    parses(inverse);
  });
});

describe("delete command", () => {
  it("builds a remove-element op whose inverse re-inserts the node", () => {
    const op = createDeleteCommand(
      {
        element: ref("el-1"),
        parent: ref("parent-1"),
        index: 0,
        tagName: "button",
        attributes: { class: "btn" },
      },
      { id: "op-del-0001", timestamp },
    );

    expect(op.kind).toBe("remove-element");
    expect(op.attributes).toEqual({ class: "btn" });

    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("insert-element");
    if (inverse.kind !== "insert-element") throw new Error("expected insert-element inverse");
    expect(inverse.element.runtimeId).toBe("el-1");
    expect(inverse.tagName).toBe("button");
    parses(inverse);
  });
});

describe("wrap / unwrap round-trip", () => {
  it("wraps two elements and unwrap restores the original structure", () => {
    const wrap = createWrapInContainerCommand(
      {
        targets: [ref("a"), ref("b")],
        wrapper: ref("wrapper-1"),
        parent: ref("parent-1"),
      },
      { id: "op-wrap-001", timestamp },
    );

    expect(wrap.kind).toBe("wrap-elements");
    expect(wrap.targets).toHaveLength(2);
    expect(wrap.tagName).toBe("div");

    const unwrap = computeInverse(wrap);
    expect(unwrap.kind).toBe("unwrap-element");
    if (unwrap.kind !== "unwrap-element") throw new Error("expected unwrap-element inverse");
    expect(unwrap.wrapper.runtimeId).toBe("wrapper-1");
    expect(unwrap.targets.map((t) => t.runtimeId)).toEqual(["a", "b"]);

    // Double-inverse restores the wrap shape (Wrap ↔ Unwrap are mutual).
    const rewrapped = computeInverse(unwrap);
    expect(rewrapped.kind).toBe("wrap-elements");
    if (rewrapped.kind !== "wrap-elements") throw new Error("expected wrap-elements re-inverse");
    expect(rewrapped.targets.map((t) => t.runtimeId)).toEqual(["a", "b"]);
    parses(wrap);
    parses(unwrap);
  });

  it("unwrap builds an op whose inverse re-wraps", () => {
    const unwrap = createUnwrapCommand(
      {
        wrapper: ref("wrapper-1"),
        parent: ref("parent-1"),
        targets: [ref("a"), ref("b")],
        tagName: "section",
      },
      { id: "op-unwrap-001", timestamp },
    );

    expect(unwrap.kind).toBe("unwrap-element");
    expect(unwrap.tagName).toBe("section");

    const inverse = computeInverse(unwrap);
    expect(inverse.kind).toBe("wrap-elements");
    parses(unwrap);
  });

  it("wrap rejects an empty target list", () => {
    expect(() =>
      createWrapInContainerCommand({
        targets: [],
        wrapper: ref("w"),
        parent: ref("p"),
      }),
    ).toThrowError(UnsupportedLayoutError);
  });
});

describe("group selection", () => {
  it("wraps a multi-element selection (>=2 targets)", () => {
    const op = createGroupSelectionCommand(
      {
        targets: [ref("a"), ref("b"), ref("c")],
        wrapper: ref("group-1"),
        parent: ref("parent-1"),
      },
      { id: "op-group-001", timestamp },
    );

    expect(op.kind).toBe("wrap-elements");
    expect(op.targets).toHaveLength(3);
  });

  it("rejects a single-target selection (group requires >=2)", () => {
    expect(() =>
      createGroupSelectionCommand({
        targets: [ref("a")],
        wrapper: ref("group-1"),
        parent: ref("parent-1"),
      }),
    ).toThrowError(UnsupportedLayoutError);
  });
});

describe("create stack / flex container", () => {
  it("createStack inserts a flex-column container", () => {
    const op = createStackCommand(
      { element: ref("stack-1"), parent: ref("parent-1"), index: 0 },
      { id: "op-stack-001", timestamp },
    );

    expect(op.kind).toBe("insert-element");
    expect(op.attributes?.style).toBe("display:flex;flex-direction:column");
    expect(computeInverse(op).kind).toBe("remove-element");
    parses(op);
  });

  it("createFlexContainer inserts a flex-row container", () => {
    const op = createFlexContainerCommand(
      { element: ref("flex-1"), parent: ref("parent-1"), index: 1 },
      { id: "op-flex-001", timestamp },
    );

    expect(op.kind).toBe("insert-element");
    expect(op.attributes?.style).toBe("display:flex;flex-direction:row");
    expect(computeInverse(op).kind).toBe("remove-element");
  });
});

describe("move to front / back", () => {
  it("moveToFront sets z-index on a positioned element", () => {
    const op = createMoveToFrontCommand(
      { target: ref("el-1"), zIndex: "10", currentRole: "absolute", previousZIndex: "1" },
      { id: "op-front-001", timestamp },
    );

    expect(op.kind).toBe("style-edit");
    expect(op.property).toBe("z-index");
    expect(op.value).toBe("10");
    expect(op.previousValue).toBe("1");
  });

  it("moveToFront rejects a normal-flow element (positioned context only)", () => {
    expect(() =>
      createMoveToFrontCommand({ target: ref("el-1"), zIndex: "10", currentRole: "block" }),
    ).toThrowError(UnsupportedLayoutError);
  });

  it("moveToBack rejects an inline element", () => {
    expect(() =>
      createMoveToBackCommand({ target: ref("el-1"), zIndex: "0", currentRole: "inline" }),
    ).toThrowError(UnsupportedLayoutError);
  });

  it("moveToBack sets z-index on a sticky element", () => {
    const op = createMoveToBackCommand(
      { target: ref("el-1"), zIndex: "0", currentRole: "sticky" },
      { id: "op-back-001", timestamp },
    );
    expect(op.kind).toBe("style-edit");
    expect(op.value).toBe("0");
  });
});

describe("convert layout", () => {
  it("convertLayoutToFlex sets display:flex with an invertible inverse", () => {
    const op = createConvertLayoutToFlexCommand(
      { container: ref("c-1"), previousDisplay: "block" },
      { id: "op-cflex-001", timestamp },
    );

    expect(op.kind).toBe("set-container-layout");
    expect(op.property).toBe("display");
    expect(op.value).toBe("flex");
    expect(op.previousValue).toBe("block");

    const inverse = computeInverse(op);
    if (inverse.kind !== "set-container-layout") throw new Error("expected set-container-layout");
    expect(inverse.value).toBe("block");
    expect(inverse.previousValue).toBe("flex");
    parses(op);
  });

  it("convertLayoutToGrid sets display:grid", () => {
    const op = createConvertLayoutToGridCommand(
      { container: ref("c-1"), previousDisplay: "flex" },
      { id: "op-cgrid-001", timestamp },
    );
    expect(op.kind).toBe("set-container-layout");
    expect(op.value).toBe("grid");

    const inverse = computeInverse(op);
    if (inverse.kind !== "set-container-layout") throw new Error("expected set-container-layout");
    expect(inverse.value).toBe("flex");
  });
});

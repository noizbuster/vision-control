import { describe, expect, it } from "vitest";

import { computeInverse, mergeChangeSets, type Operation, OperationSchema } from "./index.js";
import { changeSetWith, flexPairOperation } from "./test-support/change-ir-fixtures.js";

const freshRuntimeCssOperation = (
  pair: Extract<Operation, { kind: "resize-flex-pair" }>,
  kind: "style-edit" | "remove-style" | "resize-element",
  property: "flex-basis" | "color" = "flex-basis",
): Operation => {
  const target = { ...pair.members[0].element, runtimeId: "fresh-primary" };
  const base = {
    id: `op-${kind}-durable-alias`,
    timestamp: pair.timestamp + 1,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
  };
  switch (kind) {
    case "style-edit":
      return { ...base, kind, target, property, value: "260px", important: false };
    case "remove-style":
      return { ...base, kind, target, property, previousValue: "240px" };
    case "resize-element":
      return {
        ...base,
        kind,
        element: target,
        property: property === "color" ? "width" : property,
        fromValue: "240",
        toValue: "260",
        unit: "px",
      };
  }
};

describe("pair identity aliases", () => {
  it.each([
    "pair-first",
    "pair-second",
  ] as const)("conflicts when fresh runtime ids alias durable members in %s orientation", (orientation) => {
    const first = OperationSchema.parse(flexPairOperation());
    if (first.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const primary = { ...first.members[0].element, runtimeId: "fresh-primary" };
    const neighbor = { ...first.members[1].element, runtimeId: "fresh-neighbor" };
    const alias = OperationSchema.parse({
      ...first,
      id: "op-flex-pair-alias",
      target: primary,
      members: [
        { ...first.members[0], element: primary },
        { ...first.members[1], element: neighbor },
      ],
    });
    const left = orientation === "pair-first" ? first : alias;
    const right = orientation === "pair-first" ? alias : first;
    expect(
      mergeChangeSets(
        changeSetWith("cs-durable-left", [left]),
        changeSetWith("cs-durable-right", [right]),
      ).ok,
    ).toBe(false);
  });

  it.each(
    (["style-edit", "remove-style", "resize-element"] as const).flatMap((kind) =>
      (["pair-first", "pair-second"] as const).map((orientation) => ({ kind, orientation })),
    ),
  )("conflicts with fresh-runtime $kind in $orientation orientation", ({ kind, orientation }) => {
    const pair = OperationSchema.parse(flexPairOperation());
    if (pair.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const ordinary = freshRuntimeCssOperation(pair, kind);
    const left = orientation === "pair-first" ? pair : ordinary;
    const right = orientation === "pair-first" ? ordinary : pair;

    expect(
      mergeChangeSets(
        changeSetWith("cs-cross-kind-left", [left]),
        changeSetWith("cs-cross-kind-right", [right]),
      ).ok,
    ).toBe(false);
  });

  it("allows a fresh-runtime durable alias on a different CSS property", () => {
    const pair = OperationSchema.parse(flexPairOperation());
    if (pair.kind !== "resize-flex-pair") throw new Error("expected pair operation");

    expect(
      mergeChangeSets(
        changeSetWith("cs-different-slot-left", [pair]),
        changeSetWith("cs-different-slot-right", [
          freshRuntimeCssOperation(pair, "style-edit", "color"),
        ]),
      ).ok,
    ).toBe(true);
  });

  it.each([
    "forward-first",
    "inverse-first",
  ] as const)("allows an exact pair inverse in %s orientation", (orientation) => {
    const forward = OperationSchema.parse(flexPairOperation());
    const inverse = computeInverse(forward);
    const left = orientation === "forward-first" ? forward : inverse;
    const right = orientation === "forward-first" ? inverse : forward;
    expect(
      mergeChangeSets(
        changeSetWith("cs-inverse-left", [left]),
        changeSetWith("cs-inverse-right", [right]),
      ).ok,
    ).toBe(true);
  });
});

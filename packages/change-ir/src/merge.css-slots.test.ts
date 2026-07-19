import { describe, expect, it } from "vitest";

import {
  computeInverse,
  conflictSignatures,
  mergeChangeSets,
  type Operation,
  OperationSchema,
} from "./index.js";
import { changeSetWith, elementRef, flexPairOperation } from "./test-support/change-ir-fixtures.js";

const PAIR_SLOT_CASES = [
  { runtimeId: "card-primary", property: "flex-grow", slot: "css:card-primary:flex-grow" },
  { runtimeId: "card-primary", property: "flex-shrink", slot: "css:card-primary:flex-shrink" },
  { runtimeId: "card-primary", property: "flex-basis", slot: "css:card-primary:flex-basis" },
  { runtimeId: "card-neighbor", property: "flex-grow", slot: "css:card-neighbor:flex-grow" },
  { runtimeId: "card-neighbor", property: "flex-shrink", slot: "css:card-neighbor:flex-shrink" },
  { runtimeId: "card-neighbor", property: "flex-basis", slot: "css:card-neighbor:flex-basis" },
] as const;

type PairSlotCase = {
  readonly runtimeId: "card-primary" | "card-neighbor";
  readonly property: "flex-grow" | "flex-shrink" | "flex-basis";
  readonly slot: string;
};

const cssOperation = (
  kind: "style-edit" | "remove-style" | "resize-element",
  slotCase: PairSlotCase,
): Operation => {
  const base = {
    id: `op-${kind}-${slotCase.runtimeId}-${slotCase.property}`,
    timestamp: 1_700_000_000_000,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
  };
  switch (kind) {
    case "style-edit":
      return {
        ...base,
        kind,
        target: elementRef(slotCase.runtimeId),
        property: slotCase.property,
        value: "1",
        important: false,
        previousValue: "0",
      };
    case "remove-style":
      return {
        ...base,
        kind,
        target: elementRef(slotCase.runtimeId),
        property: slotCase.property,
        previousValue: "0",
      };
    case "resize-element":
      return {
        ...base,
        kind,
        element: elementRef(slotCase.runtimeId),
        property: slotCase.property,
        fromValue: "0",
        toValue: "1",
        unit: "px",
      };
    default: {
      const exhaustive: never = kind;
      throw new Error(`unexpected CSS operation ${exhaustive}`);
    }
  }
};

const OVERLAP_CASES = PAIR_SLOT_CASES.flatMap((slotCase) =>
  (["style-edit", "remove-style", "resize-element"] as const).flatMap((kind) =>
    (["pair-first", "pair-second"] as const).map((orientation) => ({
      ...slotCase,
      kind,
      orientation,
    })),
  ),
);

describe("pair CSS conflict signatures", () => {
  it("returns the six literal member CSS slots in stable order", () => {
    const pair = OperationSchema.parse(flexPairOperation());
    expect(conflictSignatures(pair)).toEqual([
      "css:card-primary:flex-grow",
      "css:card-primary:flex-shrink",
      "css:card-primary:flex-basis",
      "css:card-neighbor:flex-grow",
      "css:card-neighbor:flex-shrink",
      "css:card-neighbor:flex-basis",
    ]);
  });

  it.each(OVERLAP_CASES)("conflicts for $slot against $kind in $orientation orientation", ({
    kind,
    orientation,
    runtimeId,
    property,
    slot,
  }) => {
    const pair = OperationSchema.parse(flexPairOperation());
    const other = cssOperation(kind, { runtimeId, property, slot });
    const first = orientation === "pair-first" ? pair : other;
    const second = orientation === "pair-first" ? other : pair;
    const result = mergeChangeSets(
      changeSetWith("cs-first-0001", [first]),
      changeSetWith("cs-second-001", [second]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts.some((conflict) => conflict.reason.includes(slot))).toBe(true);
  });

  it("reports literal pair intersections and leaves unrelated slots disjoint", () => {
    const first = OperationSchema.parse(flexPairOperation());
    const same = OperationSchema.parse({ ...flexPairOperation(), id: "op-flex-pair-002" });
    const unrelated = OperationSchema.parse({
      ...flexPairOperation(),
      id: "op-flex-pair-003",
      target: { ...flexPairOperation().target, runtimeId: "other-primary", occurrence: 3 },
      members: [
        {
          ...flexPairOperation().members[0],
          element: {
            ...flexPairOperation().members[0].element,
            runtimeId: "other-primary",
            occurrence: 3,
          },
        },
        {
          ...flexPairOperation().members[1],
          element: {
            ...flexPairOperation().members[1].element,
            runtimeId: "other-neighbor",
            occurrence: 4,
          },
        },
      ],
    });
    expect(
      conflictSignatures(same).filter((slot) => conflictSignatures(first).includes(slot)),
    ).toEqual([
      "css:card-primary:flex-grow",
      "css:card-primary:flex-shrink",
      "css:card-primary:flex-basis",
      "css:card-neighbor:flex-grow",
      "css:card-neighbor:flex-shrink",
      "css:card-neighbor:flex-basis",
    ]);
    expect(
      conflictSignatures(unrelated).filter((slot) => conflictSignatures(first).includes(slot)),
    ).toEqual([]);
  });

  it.each([
    {
      name: "shared primary",
      replacePrimary: false,
      replaceNeighbor: true,
      expected: [
        "css:card-primary:flex-grow",
        "css:card-primary:flex-shrink",
        "css:card-primary:flex-basis",
      ],
    },
    {
      name: "shared neighbor",
      replacePrimary: true,
      replaceNeighbor: false,
      expected: [
        "css:card-neighbor:flex-grow",
        "css:card-neighbor:flex-shrink",
        "css:card-neighbor:flex-basis",
      ],
    },
  ])("finds the literal pair-versus-pair slots for $name", ({
    replacePrimary,
    replaceNeighbor,
    expected,
  }) => {
    const first = OperationSchema.parse(flexPairOperation());
    if (first.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const replacementPrimary = {
      ...first.members[0].element,
      runtimeId: "replacement-primary",
      occurrence: 3,
    };
    const replacementNeighbor = {
      ...first.members[1].element,
      runtimeId: "replacement-neighbor",
      occurrence: 4,
    };
    const second = OperationSchema.parse({
      ...first,
      id: "op-flex-pair-partial",
      target: replacePrimary ? replacementPrimary : first.target,
      members: [
        {
          ...first.members[0],
          element: replacePrimary ? replacementPrimary : first.members[0].element,
        },
        {
          ...first.members[1],
          element: replaceNeighbor ? replacementNeighbor : first.members[1].element,
        },
      ],
    });
    expect(
      conflictSignatures(second).filter((slot) => conflictSignatures(first).includes(slot)),
    ).toEqual(expected);
  });

  it("allows an exact pair inverse but still rejects a real conflict in the same bucket", () => {
    const pair = OperationSchema.parse(flexPairOperation());
    const inverse = computeInverse(pair);
    const realConflict = cssOperation("style-edit", PAIR_SLOT_CASES[0]);
    const result = mergeChangeSets(
      changeSetWith("cs-forward-real", [pair, realConflict]),
      changeSetWith("cs-inverse-001", [inverse]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.map((conflict) => conflict.operationIds)).toContainEqual([
        realConflict.id,
        inverse.id,
      ]);
    }
  });
});

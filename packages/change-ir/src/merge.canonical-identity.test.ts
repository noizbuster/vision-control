import { describe, expect, it } from "vitest";

import {
  computeInverse,
  deserializeChangeSet,
  type ElementRef,
  mergeChangeSets,
  type Operation,
  OperationSchema,
  serializeChangeSet,
} from "./index.js";
import { changeSetWith, flexPairOperation } from "./test-support/change-ir-fixtures.js";

const ORDINARY_KINDS = ["style-edit", "remove-style", "resize-element"] as const;
const PAIR_PROPERTIES = ["flex-grow", "flex-shrink", "flex-basis"] as const;
const MEMBER_INDEXES = [0, 1] as const;
const MERGE_ORIENTATIONS = ["pair-first", "pair-second"] as const;

type OrdinaryKind = (typeof ORDINARY_KINDS)[number];
type PairProperty = (typeof PAIR_PROPERTIES)[number];
type MemberIndex = (typeof MEMBER_INDEXES)[number];
type MergeOrientation = (typeof MERGE_ORIENTATIONS)[number];
type PairOperation = Extract<Operation, { kind: "resize-flex-pair" }>;
type OrdinaryCssOperation = Extract<Operation, { kind: OrdinaryKind }>;

type CanonicalCssCase = {
  readonly kind: OrdinaryKind;
  readonly memberIndex: MemberIndex;
  readonly property: PairProperty | "color";
  readonly orientation: MergeOrientation;
};

const conflictCases: readonly CanonicalCssCase[] = ORDINARY_KINDS.flatMap((kind) =>
  MEMBER_INDEXES.flatMap((memberIndex) =>
    PAIR_PROPERTIES.flatMap((property) =>
      MERGE_ORIENTATIONS.map((orientation) => ({ kind, memberIndex, property, orientation })),
    ),
  ),
);

const differentPropertyCases: readonly CanonicalCssCase[] = ORDINARY_KINDS.flatMap((kind) =>
  MEMBER_INDEXES.flatMap((memberIndex) =>
    MERGE_ORIENTATIONS.map((orientation) => ({
      kind,
      memberIndex,
      property: "color" as const,
      orientation,
    })),
  ),
);

const canonicalOperation = (operation: Operation): Operation => {
  const parsed = OperationSchema.parse(operation);
  const decoded = deserializeChangeSet(
    serializeChangeSet(changeSetWith("cs-canonical-roundtrip", [parsed])),
  );
  if (!decoded.success) throw new Error(decoded.error.message);
  const canonical = decoded.data.operations[0];
  if (canonical === undefined) throw new Error("canonical changeset omitted its operation");
  return canonical;
};

const canonicalPair = (): PairOperation => {
  const operation = canonicalOperation(OperationSchema.parse(flexPairOperation()));
  if (operation.kind !== "resize-flex-pair") throw new Error("expected canonical pair");
  return operation;
};

const canonicalOrdinary = (operation: Operation): OrdinaryCssOperation => {
  const canonical = canonicalOperation(operation);
  switch (canonical.kind) {
    case "style-edit":
    case "remove-style":
    case "resize-element":
      return canonical;
    default:
      throw new Error(`expected canonical ordinary CSS operation, received ${canonical.kind}`);
  }
};

const ordinaryRef = (operation: OrdinaryCssOperation): ElementRef => {
  switch (operation.kind) {
    case "style-edit":
    case "remove-style":
      return operation.target;
    case "resize-element":
      return operation.element;
  }
};

const ordinaryOperation = (
  pair: PairOperation,
  testCase: CanonicalCssCase,
): OrdinaryCssOperation => {
  const member = pair.members[testCase.memberIndex];
  const element = { ...member.element, runtimeId: `fresh-${testCase.memberIndex}` };
  const base = {
    id: `op-${testCase.kind}-${testCase.memberIndex}-${testCase.property}`,
    timestamp: pair.timestamp + 1,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
  };
  switch (testCase.kind) {
    case "style-edit":
      return {
        ...base,
        kind: testCase.kind,
        target: element,
        property: testCase.property,
        value: "260px",
        important: false,
      };
    case "remove-style":
      return {
        ...base,
        kind: testCase.kind,
        target: element,
        property: testCase.property,
        previousValue: "240px",
      };
    case "resize-element":
      return {
        ...base,
        kind: testCase.kind,
        element,
        property: testCase.property === "color" ? "width" : testCase.property,
        fromValue: "240",
        toValue: "260",
        unit: "px",
      };
  }
};

const legacyOrdinaryOperation = (kind: OrdinaryKind): OrdinaryCssOperation => {
  const element = { runtimeId: `legacy-${kind}` };
  const base = {
    id: `op-legacy-${kind}`,
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
        target: element,
        property: "flex-basis",
        value: "260px",
        important: false,
      };
    case "remove-style":
      return { ...base, kind, target: element, property: "flex-basis" };
    case "resize-element":
      return {
        ...base,
        kind,
        element,
        property: "flex-basis",
        fromValue: "240",
        toValue: "260",
        unit: "px",
      };
  }
};

const mergeOk = (left: Operation, right: Operation): boolean =>
  mergeChangeSets(
    changeSetWith("cs-canonical-left", [left]),
    changeSetWith("cs-canonical-right", [right]),
  ).ok;

describe("canonical durable pair aliases", () => {
  it.each(
    ORDINARY_KINDS.flatMap((kind) => MEMBER_INDEXES.map((memberIndex) => ({ kind, memberIndex }))),
  )("retains durable identity for $kind member $memberIndex", ({ kind, memberIndex }) => {
    const pair = canonicalPair();
    const ordinary = canonicalOrdinary(
      ordinaryOperation(pair, {
        kind,
        memberIndex,
        property: "flex-basis",
        orientation: "pair-first",
      }),
    );

    expect(ordinaryRef(ordinary)).toMatchObject({
      runtimeId: `fresh-${memberIndex}`,
      selector: pair.members[memberIndex].element.selector,
      occurrence: pair.members[memberIndex].element.occurrence,
      fingerprint: pair.members[memberIndex].element.fingerprint,
    });
  });

  it.each(
    conflictCases,
  )("conflicts for $kind member $memberIndex $property in $orientation orientation", (testCase) => {
    const pair = canonicalPair();
    const ordinary = canonicalOrdinary(ordinaryOperation(pair, testCase));
    const left = testCase.orientation === "pair-first" ? pair : ordinary;
    const right = testCase.orientation === "pair-first" ? ordinary : pair;

    expect(mergeOk(left, right)).toBe(false);
  });

  it.each(
    differentPropertyCases,
  )("merges different property for $kind member $memberIndex in $orientation orientation", (testCase) => {
    const pair = canonicalPair();
    const ordinary = canonicalOrdinary(ordinaryOperation(pair, testCase));
    const left = testCase.orientation === "pair-first" ? pair : ordinary;
    const right = testCase.orientation === "pair-first" ? ordinary : pair;

    expect(mergeOk(left, right)).toBe(true);
  });

  it.each(ORDINARY_KINDS)("parses legacy %s payloads without durable identity", (kind) => {
    const legacy = legacyOrdinaryOperation(kind);
    const decoded = deserializeChangeSet(
      JSON.stringify({ ...changeSetWith("cs-legacy-ordinary", [legacy]), schemaVersion: "2.0.0" }),
    );

    expect(decoded.success).toBe(true);
  });

  it.each(
    ORDINARY_KINDS.flatMap((kind) =>
      MERGE_ORIENTATIONS.map((orientation) => ({ kind, orientation })),
    ),
  )("does not infer durable identity for legacy $kind in $orientation orientation", ({
    kind,
    orientation,
  }) => {
    const pair = canonicalPair();
    const ordinary = canonicalOrdinary(legacyOrdinaryOperation(kind));
    const left = orientation === "pair-first" ? pair : ordinary;
    const right = orientation === "pair-first" ? ordinary : pair;

    expect(mergeOk(left, right)).toBe(true);
  });

  it.each([
    "forward-first",
    "inverse-first",
  ] as const)("merges an exact canonical pair inverse in %s orientation", (orientation) => {
    const forward = canonicalPair();
    const inverse = canonicalOperation(computeInverse(forward));
    const left = orientation === "forward-first" ? forward : inverse;
    const right = orientation === "forward-first" ? inverse : forward;

    expect(mergeOk(left, right)).toBe(true);
  });
});

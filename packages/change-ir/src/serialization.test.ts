import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type CanonicalChangeSet,
  deserializeChangeSet,
  OperationSchema,
  serializeChangeSet,
} from "./index.js";
import { arbChangeSet } from "./property-arbitraries/index.js";
import {
  BASE_TIME,
  flexPairOperation,
  legacy20Defaults,
  styleEdit,
} from "./test-support/change-ir-fixtures.js";

const SERIALIZATION_SEEDS = [-425667733, 314159265, 161803399] as const;

const canonicalJsonValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const canonicalChangeSet = (): CanonicalChangeSet => ({
  ...legacy20Defaults,
  schemaVersion: "2.1.0",
  id: "cs-fixed-000001",
  sessionId: "sess-fixed-001",
  operations: [styleEdit()],
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME + 1,
  committed: false,
});

describe("changeset serialization", () => {
  it("round-trips canonical 2.1.0 data deep-equal", () => {
    const changeSet = canonicalChangeSet();
    const result = deserializeChangeSet(serializeChangeSet(changeSet));
    expect(result).toEqual({ success: true, data: changeSet });
  });

  it("serializes a 2.0.0 document as canonical 2.1.0", () => {
    const legacy = { ...canonicalChangeSet(), schemaVersion: "2.0.0" as const };
    const serialized = serializeChangeSet(legacy);
    expect(JSON.parse(serialized)).toEqual({ ...legacy, schemaVersion: "2.1.0" });
    const result = deserializeChangeSet(serialized);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.schemaVersion).toBe("2.1.0");
  });

  it("preserves runtime preview flags", () => {
    const changeSet: CanonicalChangeSet = {
      ...canonicalChangeSet(),
      operations: [{ ...styleEdit(), runtime: true }],
    };
    const result = deserializeChangeSet(serializeChangeSet(changeSet));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.operations[0]?.runtime).toBe(true);
  });

  it("round-trips every literal flex-pair identity and witness field", () => {
    const pair = OperationSchema.parse(flexPairOperation());
    const changeSet: CanonicalChangeSet = {
      ...canonicalChangeSet(),
      operations: [pair],
    };
    const result = deserializeChangeSet(serializeChangeSet(changeSet));
    expect(result).toEqual({ success: true, data: changeSet });
  });

  it("canonicalizes negative zero and omits optional undefined fields", () => {
    const parsedPair = OperationSchema.parse({
      ...flexPairOperation(),
      target: { ...flexPairOperation().target, sourceId: undefined },
      containerWitness: {
        ...flexPairOperation().containerWitness,
        after: { ...flexPairOperation().containerWitness.after, x: -0 },
      },
      notes: undefined,
    });
    if (parsedPair.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const input: CanonicalChangeSet = {
      ...canonicalChangeSet(),
      title: undefined,
      operations: [parsedPair],
    };
    const { title: _title, ...expectedChangeSet } = input;
    const { notes: _notes, ...expectedPairWithoutNotes } = parsedPair;
    const { sourceId: _sourceId, ...expectedTarget } = parsedPair.target;
    const expectedPair = {
      ...expectedPairWithoutNotes,
      target: expectedTarget,
      containerWitness: {
        ...parsedPair.containerWitness,
        after: { ...parsedPair.containerWitness.after, x: 0 },
      },
    };

    expect(Object.is(parsedPair.containerWitness.after.x, -0)).toBe(true);
    expect("title" in input).toBe(true);
    expect("sourceId" in parsedPair.target).toBe(true);
    expect("notes" in parsedPair).toBe(true);
    expect(deserializeChangeSet(serializeChangeSet(input))).toEqual({
      success: true,
      data: { ...expectedChangeSet, operations: [expectedPair] },
    });
  });

  it("is deterministic for the same input", () => {
    const changeSet = canonicalChangeSet();
    expect(serializeChangeSet(changeSet)).toBe(serializeChangeSet(changeSet));
  });

  it.each([
    "{not json",
    JSON.stringify({ id: "x" }),
  ])("returns an error result for malformed input %s", (input) => {
    expect(deserializeChangeSet(input).success).toBe(false);
  });

  it.each(
    SERIALIZATION_SEEDS,
  )("round-trips generated changesets with canonical JSON semantics for seed %s", (seed) => {
    fc.assert(
      fc.property(arbChangeSet, (changeSet) => {
        const result = deserializeChangeSet(serializeChangeSet(changeSet));
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toEqual(canonicalJsonValue(changeSet));
      }),
      { numRuns: 100, seed },
    );
  });

  it("keeps generated serialization deterministic", () => {
    fc.assert(
      fc.property(arbChangeSet, (changeSet) => {
        expect(serializeChangeSet(changeSet)).toBe(serializeChangeSet(changeSet));
      }),
      { numRuns: 100 },
    );
  });
});

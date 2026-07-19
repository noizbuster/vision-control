import { describe, expect, it } from "vitest";

import { OperationSchema } from "./operations/index.js";
import { flexPairOperation as pairOperation } from "./test-support/change-ir-fixtures.js";

describe("resize-flex-pair operation schema", () => {
  it("accepts a witness-complete pair when every identity and axis field is valid", () => {
    const result = OperationSchema.safeParse(pairOperation());

    expect(result.success).toBe(true);
  });

  it.each([
    {
      name: "duplicate roles",
      payload: () => {
        const operation = pairOperation();
        return {
          ...operation,
          members: [operation.members[0], { ...operation.members[1], role: "primary" }],
        };
      },
    },
    {
      name: "same-node members",
      payload: () => {
        const operation = pairOperation();
        return {
          ...operation,
          members: [
            operation.members[0],
            { ...operation.members[1], element: operation.members[0].element },
          ],
        };
      },
    },
    {
      name: "container/member identity collision",
      payload: () => {
        const operation = pairOperation();
        return { ...operation, container: operation.members[0].element };
      },
    },
    {
      name: "duplicate witnesses",
      payload: () => {
        const operation = pairOperation();
        return { ...operation, witnesses: [operation.witnesses[0], operation.witnesses[0]] };
      },
    },
    {
      name: "witness/member overlap",
      payload: () => {
        const operation = pairOperation();
        return {
          ...operation,
          witnesses: [{ ...operation.witnesses[0], element: operation.members[1].element }],
        };
      },
    },
    {
      name: "fewer than two members",
      payload: () => {
        const operation = pairOperation();
        return { ...operation, members: [operation.members[0]] };
      },
    },
    {
      name: "more than two members",
      payload: () => {
        const operation = pairOperation();
        return { ...operation, members: [...operation.members, operation.members[1]] };
      },
    },
    {
      name: "missing occurrence",
      payload: () => {
        const operation = pairOperation();
        const { occurrence: omitted, ...element } = operation.members[1].element;
        void omitted;
        return {
          ...operation,
          members: [operation.members[0], { ...operation.members[1], element }],
        };
      },
    },
    {
      name: "missing selector",
      payload: () => {
        const operation = pairOperation();
        const { selector: omitted, ...element } = operation.members[1].element;
        void omitted;
        return {
          ...operation,
          members: [operation.members[0], { ...operation.members[1], element }],
        };
      },
    },
    {
      name: "missing fingerprint",
      payload: () => {
        const operation = pairOperation();
        const { fingerprint: omitted, ...element } = operation.members[1].element;
        void omitted;
        return {
          ...operation,
          members: [operation.members[0], { ...operation.members[1], element }],
        };
      },
    },
    {
      name: "witness/container overlap",
      payload: () => {
        const operation = pairOperation();
        return {
          ...operation,
          witnesses: [{ ...operation.witnesses[0], element: operation.container }],
        };
      },
    },
    {
      name: "missing non-pair witness collection",
      payload: () => {
        const { witnesses: omitted, ...operation } = pairOperation();
        void omitted;
        return operation;
      },
    },
    {
      name: "missing container witness",
      payload: () => {
        const { containerWitness: omitted, ...operation } = pairOperation();
        void omitted;
        return operation;
      },
    },
    {
      name: "non-finite geometry",
      payload: () => {
        const operation = pairOperation();
        return {
          ...operation,
          containerWitness: {
            ...operation.containerWitness,
            after: { ...operation.containerWitness.after, width: Number.POSITIVE_INFINITY },
          },
        };
      },
    },
    {
      name: "non-finite delta",
      payload: () => ({ ...pairOperation(), delta: Number.NaN }),
    },
    {
      name: "missing flex triple",
      payload: () => {
        const operation = pairOperation();
        const { flex: omitted, ...before } = operation.members[0].before;
        void omitted;
        return {
          ...operation,
          members: [{ ...operation.members[0], before }, operation.members[1]],
        };
      },
    },
    {
      name: "malformed axis metadata",
      payload: () => ({
        ...pairOperation(),
        axis: { ...pairOperation().axis, physicalAxis: "y" },
      }),
    },
    {
      name: "missing axis boundary",
      payload: () => {
        const operation = pairOperation();
        const { handleBoundary: omitted, ...axis } = operation.axis;
        void omitted;
        return { ...operation, axis };
      },
    },
    {
      name: "invalid direction sign",
      payload: () => ({ ...pairOperation(), axis: { ...pairOperation().axis, directionSign: 0 } }),
    },
  ])("rejects $name when parsing an untrusted pair payload", ({ payload }) => {
    const result = OperationSchema.safeParse(payload());

    expect(result.success).toBe(false);
  });
});

export { pairOperation };

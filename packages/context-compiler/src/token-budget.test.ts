import { describe, expect, it } from "vitest";
import { makeCandidate, makeChangeSet, makeInputs } from "./context-test-fixtures.js";
import { makeFlexResizeOperation } from "./flex-resize.test-fixture.js";
import { compileContext, DEFAULT_TOKEN_BUDGET, TokenBudget } from "./index.js";

describe("TokenBudget truncation order", () => {
  it("truncates low-priority sections before high-priority ones", () => {
    const inputs = makeInputs({
      sourceCandidates: [makeCandidate({ snippet: "x".repeat(6000) })],
      warnings: [{ code: "stale", message: "registry is stale", severity: "warning" }],
      tokenBudget: 80,
    });
    const context = compileContext(inputs);
    expect(context.metadata.truncated).toBe(true);
    expect(context.goal).toBe(inputs.goal);
    expect(context.warnings).toHaveLength(0);
    expect(context.metadata.truncatedSections).toContain("warnings");
  });

  it("orders truncated sections from lowest to highest priority", () => {
    const context = compileContext(
      makeInputs({
        sourceCandidates: [makeCandidate({ snippet: "y".repeat(8000) })],
        tokenBudget: 60,
      }),
    );
    const priority = [
      "privacyReport",
      "warnings",
      "verificationPlan",
      "layout",
      "target",
      "source",
      "operations",
    ];
    const ranks = context.metadata.truncatedSections.map((section) => priority.indexOf(section));
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  it("does not truncate when the context fits", () => {
    const context = compileContext(makeInputs({ tokenBudget: DEFAULT_TOKEN_BUDGET }));
    expect(context.metadata.truncated).toBe(false);
    expect(context.metadata.truncatedSections).toEqual([]);
  });

  it("estimates larger content as more tokens", () => {
    const budget = new TokenBudget(1000);
    const small = budget.estimate({ a: 1 });
    const large = budget.estimate({ a: "x".repeat(4000) });
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(900);
  });

  it("never strips machine-consumed flex pair detail", () => {
    const pair = makeFlexResizeOperation();
    const changeset = { ...makeChangeSet([pair]), schemaVersion: "2.1.0" as const };
    const context = compileContext(
      makeInputs({
        changeset,
        sourceCandidates: [makeCandidate({ snippet: "z".repeat(8000) })],
        tokenBudget: 1,
      }),
    );
    const summary = context.operations[0];
    expect(summary?.kind).toBe("resize-flex-pair");
    if (summary?.kind !== "resize-flex-pair") return;
    expect(summary.detail.members).toHaveLength(2);
    expect(summary.detail.witnesses).toHaveLength(1);
    expect(summary.detail.axis.physicalAxis).toBe("x");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import {
  flexResolvedTarget,
  installFlexVerificationDom,
  makeFlexVerificationOperation,
} from "./__fixtures__/flex-verification.js";
import { createPlan } from "./verification-plan.js";

const candidateFor = (operation: ReturnType<typeof makeFlexVerificationOperation>) => ({
  selector: operation.target.selector,
  occurrence: operation.target.occurrence,
  fingerprint: operation.target.fingerprint,
  ...(operation.target.sourceId !== undefined ? { sourceId: operation.target.sourceId } : {}),
});

describe("createPlan resize-flex-pair assertions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("builds the complete paired assertion set", () => {
    const operation = makeFlexVerificationOperation();
    const plan = createPlan(operation, candidateFor(operation));
    expect(plan.assertions.map((assertion) => assertion.name)).toEqual([
      "resize-flex-pair:identity",
      "resize-flex-pair:structure",
      "resize-flex-pair:flex",
      "resize-flex-pair:member-sizes",
      "resize-flex-pair:pair-geometry",
      "resize-flex-pair:container-geometry",
      "resize-flex-pair:witness-geometry",
    ]);
  });

  it("passes every paired assertion for complete post-HMR state", () => {
    const operation = makeFlexVerificationOperation();
    const fixture = installFlexVerificationDom();
    const target = flexResolvedTarget(fixture);
    const results = createPlan(operation, candidateFor(operation)).assertions.map((assertion) =>
      assertion.run(target),
    );
    expect(results).toHaveLength(7);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});

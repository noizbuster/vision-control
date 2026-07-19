import { computeInverse } from "@vision-control/change-ir";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDomAdapter, FakeMutationObserver } from "./__fixtures__/helpers.js";
import {
  FLEX_NEIGHBOR_ID,
  FLEX_PRIMARY_ID,
  makeFlexPairOperation,
} from "./flex-resize.test-fixtures.js";
import {
  buildPreviewSelector,
  createPreviewManager,
  FlexPairPreviewError,
  type PreviewDomAdapter,
} from "./index.js";
import {
  registerDiv,
  resetDispatchTestDom,
  setupDispatchTest,
} from "./operation-dispatch.test-fixtures.js";

const readCss = (): string =>
  document.querySelector("style[data-vc-preview-stylesheet]")?.textContent ?? "";

describe("resize-flex-pair operation dispatch", () => {
  beforeEach(resetDispatchTestDom);

  it("applies both after flex triples as one active preview", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);

    manager.applyOperation(makeFlexPairOperation());

    expect(readCss()).toContain(
      `${buildPreviewSelector(FLEX_PRIMARY_ID)} { flex-grow: 0; flex-shrink: 0; flex-basis: 240px; }`,
    );
    expect(readCss()).toContain(
      `${buildPreviewSelector(FLEX_NEIGHBOR_ID)} { flex-grow: 0; flex-shrink: 0; flex-basis: 140px; }`,
    );
    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(manager.activeCount).toBe(1);
  });

  it("restores unrelated prior declarations for both members", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const primarySelector = buildPreviewSelector(FLEX_PRIMARY_ID);
    const neighborSelector = buildPreviewSelector(FLEX_NEIGHBOR_ID);
    const primaryPrior = "color:red;  margin: 0  4px!important;";
    const neighborPrior = "padding:0  2px; opacity:.75;";
    manager.stylesheet.applyRule(primarySelector, primaryPrior);
    manager.stylesheet.applyRule(neighborSelector, neighborPrior);

    const rollback = manager.applyOperation(makeFlexPairOperation());
    rollback();

    expect(readCss()).toBe(
      `${primarySelector} { ${primaryPrior} }\n${neighborSelector} { ${neighborPrior} }`,
    );
    expect(manager.activeCount).toBe(0);
  });

  it("rolls member one back when the neighbor cannot resolve", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    const primarySelector = buildPreviewSelector(FLEX_PRIMARY_ID);
    const primaryPrior = "outline: 2px solid teal;";
    manager.stylesheet.applyRule(primarySelector, primaryPrior);
    let failure: Error | null = null;

    try {
      manager.applyOperation(makeFlexPairOperation());
    } catch (error) {
      if (error instanceof Error) failure = error;
      else throw error;
    }

    expect(failure).toBeInstanceOf(FlexPairPreviewError);
    expect(failure?.name).toBe("FlexPairPreviewError");
    expect(failure?.message).toContain(FLEX_NEIGHBOR_ID);
    expect(readCss()).toBe(`${primarySelector} { ${primaryPrior} }`);
    expect(manager.stylesheet.hasRule(buildPreviewSelector(FLEX_NEIGHBOR_ID))).toBe(false);
    expect(manager.activeCount).toBe(0);
  });

  it("restores both predecessors when the neighbor stylesheet write throws", () => {
    const baseDom = createTestDomAdapter(FakeMutationObserver);
    const injectedError = new Error("injected second-member stylesheet write failure");
    let armed = false;
    let writeAttempts = 0;
    let injectedFailures = 0;
    const dom: PreviewDomAdapter = {
      ...baseDom,
      createStyleElement: () => {
        const styleElement = document.createElement("style");
        let renderedCss = "";
        Object.defineProperty(styleElement, "textContent", {
          configurable: true,
          get: () => renderedCss,
          set: (value: string | null) => {
            if (armed) {
              writeAttempts += 1;
              if (writeAttempts === 2) {
                injectedFailures += 1;
                throw injectedError;
              }
            }
            renderedCss = value ?? "";
          },
        });
        return styleElement;
      },
    };
    const manager = createPreviewManager({ dom });
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const primarySelector = buildPreviewSelector(FLEX_PRIMARY_ID);
    const neighborSelector = buildPreviewSelector(FLEX_NEIGHBOR_ID);
    const primaryPrior = "color:red;  margin: 0  4px!important;";
    const neighborPrior = "padding:0  2px; opacity:.75;";
    manager.stylesheet.applyRule(primarySelector, primaryPrior);
    manager.stylesheet.applyRule(neighborSelector, neighborPrior);
    armed = true;
    let failure: FlexPairPreviewError | null = null;

    try {
      manager.applyOperation(makeFlexPairOperation());
    } catch (error) {
      if (error instanceof FlexPairPreviewError) failure = error;
      else throw error;
    }

    expect(injectedFailures).toBe(1);
    expect(failure).toBeInstanceOf(FlexPairPreviewError);
    expect(failure?.cause).toBe(injectedError);
    expect(failure?.message).toContain(FLEX_NEIGHBOR_ID);
    expect(manager.activeCount).toBe(0);
    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(readCss()).toBe(
      `${primarySelector} { ${primaryPrior} }\n${neighborSelector} { ${neighborPrior} }`,
    );
  });

  it("repeated RAF-style replacements keep two rules and one active preview", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    let rollback = manager.applyOperation(makeFlexPairOperation());
    const updates: readonly (readonly [string, string])[] = [
      ["250px", "130px"],
      ["260px", "120px"],
      ["270px", "110px"],
    ];

    for (const [primaryAfterBasis, neighborAfterBasis] of updates) {
      rollback();
      rollback = manager.applyOperation(
        makeFlexPairOperation({ primaryAfterBasis, neighborAfterBasis }),
      );
    }

    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(manager.activeCount).toBe(1);
    expect(readCss()).toContain("flex-basis: 270px;");
    expect(readCss()).toContain("flex-basis: 110px;");
    expect(readCss()).not.toContain("flex-basis: 240px;");
  });

  it("the inverse restores both before triples and rollback reveals the forward pair", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const operation = makeFlexPairOperation();
    const rollbackForward = manager.applyOperation(operation);

    const rollbackInverse = manager.applyOperation(computeInverse(operation));

    expect(readCss()).toContain("flex-grow: 1; flex-shrink: 1; flex-basis: 200px;");
    expect(readCss()).toContain("flex-grow: 2; flex-shrink: 1; flex-basis: 180px;");
    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(manager.activeCount).toBe(2);

    rollbackInverse();
    expect(readCss()).toContain("flex-grow: 0; flex-shrink: 0; flex-basis: 240px;");
    expect(readCss()).toContain("flex-grow: 0; flex-shrink: 0; flex-basis: 140px;");
    expect(manager.activeCount).toBe(1);

    rollbackForward();
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
  });
});

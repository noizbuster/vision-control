import type { DurableElementRef, ResizeFlexPairOperation } from "@vision-control/change-ir";
import { createBrowserVerificationDomAdapter } from "@vision-control/verification-engine";
import { describe, expect, it } from "vitest";

import { runContentVerification } from "./content-verification.js";

const makePreview = () => ({
  activeCount: 1,
  clearAll(): void {
    this.activeCount = 0;
  },
});

const makeContentFlexOperation = (): ResizeFlexPairOperation => {
  document.body.innerHTML = `
    <div id="content-row" data-vc-source="row-src" style="display:flex;position:static">
      <div class="content-card" data-vc-source="neighbor-src"
           style="display:block;position:static;flex-grow:0;flex-shrink:0;flex-basis:0px"></div>
      <div class="content-card" data-vc-source="primary-src"
           style="display:block;position:static;flex-grow:0;flex-shrink:0;flex-basis:0px"></div>
      <div class="content-card" data-vc-source="witness-src"
           style="display:block;position:static"></div>
    </div>
  `;
  const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
  const container = document.querySelector("#content-row");
  const cards = document.querySelectorAll(".content-card");
  const neighbor = cards[0];
  const primary = cards[1];
  const witness = cards[2];
  if (
    container === null ||
    neighbor === undefined ||
    primary === undefined ||
    witness === undefined
  ) {
    throw new Error("test setup: content flex DOM incomplete");
  }
  const durable = (input: {
    readonly element: Element;
    readonly runtimeId: string;
    readonly selector: string;
    readonly occurrence: number;
    readonly sourceId: string;
  }): DurableElementRef => ({
    runtimeId: input.runtimeId,
    selector: input.selector,
    occurrence: input.occurrence,
    fingerprint: dom.computeFingerprint(input.element),
    sourceId: input.sourceId,
  });
  const containerRef = durable({
    element: container,
    runtimeId: "old-row",
    selector: "#content-row",
    occurrence: 0,
    sourceId: "row-src",
  });
  const neighborRef = durable({
    element: neighbor,
    runtimeId: "old-neighbor",
    selector: ".content-card",
    occurrence: 0,
    sourceId: "neighbor-src",
  });
  const primaryRef = durable({
    element: primary,
    runtimeId: "old-primary",
    selector: ".content-card",
    occurrence: 1,
    sourceId: "primary-src",
  });
  const witnessRef = durable({
    element: witness,
    runtimeId: "old-witness",
    selector: ".content-card",
    occurrence: 2,
    sourceId: "witness-src",
  });
  const state = {
    flex: { flexGrow: "0", flexShrink: "0", flexBasis: "0px" },
    usedMainSize: 0,
  };
  const rect = { x: 0, y: 0, width: 0, height: 0 };
  return {
    id: "op-content-flex-001",
    timestamp: 0,
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primaryRef,
    container: containerRef,
    members: [
      { role: "primary", element: primaryRef, before: state, after: state },
      { role: "neighbor", element: neighborRef, before: state, after: state },
    ],
    containerWitness: { before: rect, after: rect },
    witnesses: [{ element: witnessRef, before: rect, after: rect }],
    axis: {
      writingMode: "horizontal-tb",
      direction: "ltr",
      flexDirection: "row",
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
      handleBoundary: "main-end",
    },
    delta: 0,
  };
};

describe("runContentVerification resize-flex-pair", () => {
  it("returns content-owned paired results only after preview clear", async () => {
    const outcome = await runContentVerification({
      operations: [makeContentFlexOperation()],
      preview: makePreview(),
      skipHmrWait: true,
    });
    expect(outcome.passed).toBe(true);
    expect(outcome.details.previewCleared).toBe(true);
    expect(
      outcome.details.assertions.filter((assertion) =>
        assertion.name.startsWith("resize-flex-pair"),
      ),
    ).toHaveLength(7);
  });

  it("fails source verification when a direct child witness is omitted", async () => {
    const operation = makeContentFlexOperation();
    const omitted = { ...operation, witnesses: [] } satisfies ResizeFlexPairOperation;
    const outcome = await runContentVerification({
      operations: [omitted],
      preview: makePreview(),
      skipHmrWait: true,
    });
    expect(outcome.passed).toBe(false);
    expect(
      outcome.details.assertions.find(
        (assertion) => assertion.name === "resize-flex-pair:structure",
      )?.passed,
    ).toBe(false);
  });
});

import type { ResizeFlexPairOperation } from "@vision-control/change-ir";

const durableRef = (runtimeId: string, selector: string, occurrence: number) => ({
  runtimeId,
  sourceId: `source-${runtimeId}`,
  selector,
  occurrence,
  fingerprint: `fingerprint-${occurrence}`,
});

const rect = (x: number, width: number) => ({ x, y: 0, width, height: 100 });

export const makeFlexResizeOperation = (): ResizeFlexPairOperation => {
  const primary = durableRef("primary-runtime", ".card", 0);
  return {
    id: "op-flex-pair-001",
    timestamp: 1_700_000_000_000,
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primary,
    container: durableRef("container-runtime", ".row", 0),
    members: [
      {
        role: "primary",
        element: primary,
        before: {
          flex: { flexGrow: "1", flexShrink: "1", flexBasis: "auto" },
          usedMainSize: 200,
        },
        after: {
          flex: { flexGrow: "0", flexShrink: "0", flexBasis: "240px" },
          usedMainSize: 240,
        },
      },
      {
        role: "neighbor",
        element: durableRef("neighbor-runtime", ".card", 1),
        before: {
          flex: { flexGrow: "2", flexShrink: "1", flexBasis: "180px" },
          usedMainSize: 180,
        },
        after: {
          flex: { flexGrow: "0", flexShrink: "0", flexBasis: "140px" },
          usedMainSize: 140,
        },
      },
    ],
    containerWitness: { before: rect(0, 600), after: rect(0, 600) },
    witnesses: [
      {
        element: durableRef("witness-runtime", ".card", 2),
        before: rect(400, 200),
        after: rect(400, 200),
      },
    ],
    axis: {
      writingMode: "horizontal-tb",
      direction: "ltr",
      flexDirection: "row",
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
      handleBoundary: "main-end",
    },
    delta: 40,
  };
};

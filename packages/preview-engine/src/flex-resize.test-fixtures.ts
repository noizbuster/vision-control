import type { ResizeFlexPairOperation } from "@vision-control/change-ir";

export const FLEX_PRIMARY_ID = "card-primary";
export const FLEX_NEIGHBOR_ID = "card-neighbor";

interface FlexPairFixtureOptions {
  readonly primaryAfterBasis?: string;
  readonly neighborAfterBasis?: string;
  readonly runtime?: boolean;
}

const durableRef = (runtimeId: string, selector: string, occurrence: number) => ({
  runtimeId,
  selector,
  occurrence,
  fingerprint: `fingerprint-${runtimeId}`,
});

export function makeFlexPairOperation(
  options: FlexPairFixtureOptions = {},
): ResizeFlexPairOperation {
  const primary = durableRef(FLEX_PRIMARY_ID, ".card", 0);
  const neighbor = durableRef(FLEX_NEIGHBOR_ID, ".card", 1);
  return {
    id: "op-flex-pair-001",
    timestamp: 1_700_000_000_000,
    runtime: options.runtime ?? true,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primary,
    container: durableRef("card-container", ".row", 0),
    members: [
      {
        role: "primary",
        element: primary,
        before: {
          flex: { flexGrow: "1", flexShrink: "1", flexBasis: "200px" },
          usedMainSize: 200,
        },
        after: {
          flex: {
            flexGrow: "0",
            flexShrink: "0",
            flexBasis: options.primaryAfterBasis ?? "240px",
          },
          usedMainSize: 240,
        },
      },
      {
        role: "neighbor",
        element: neighbor,
        before: {
          flex: { flexGrow: "2", flexShrink: "1", flexBasis: "180px" },
          usedMainSize: 180,
        },
        after: {
          flex: {
            flexGrow: "0",
            flexShrink: "0",
            flexBasis: options.neighborAfterBasis ?? "140px",
          },
          usedMainSize: 140,
        },
      },
    ],
    containerWitness: {
      before: { x: 0, y: 20, width: 600, height: 80 },
      after: { x: 0, y: 20, width: 600, height: 80 },
    },
    witnesses: [
      {
        element: durableRef("card-witness", ".card", 2),
        before: { x: 400, y: 20, width: 200, height: 80 },
        after: { x: 400, y: 20, width: 200, height: 80 },
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
}

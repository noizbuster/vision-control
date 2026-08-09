import type { ElementRef } from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";

import { computeMoveInsertion } from "../index.js";

const parent: ElementRef = { runtimeId: "move-parent", tagName: "div" };

const item = (
  domIndex: number,
  x: number,
  y: number,
  width: number = 40,
  height: number = 40,
  options: Partial<{
    order: number;
    inFlow: boolean;
    margins: readonly [number, number, number, number];
  }> = {},
) => ({
  rect: { x, y, width, height },
  margins: {
    top: options.margins?.[0] ?? 0,
    right: options.margins?.[1] ?? 0,
    bottom: options.margins?.[2] ?? 0,
    left: options.margins?.[3] ?? 0,
  },
  domIndex,
  order: options.order ?? 0,
  inFlow: options.inFlow ?? true,
});

const flexInput = (pointer: { x: number; y: number }) => ({
  parent,
  parentRect: { x: 0, y: 0, width: 200, height: 120 },
  childCount: 4,
  items: [item(0, 0, 0), item(1, 100, 0), item(2, 0, 80), item(3, 100, 80)],
  movingOrder: 0,
  sourceIndex: null,
  pointer,
  flow: {
    kind: "flex" as const,
    axis: {
      writingMode: "horizontal-tb" as const,
      direction: "ltr" as const,
      flexDirection: "row" as const,
    },
    wrap: "wrap" as const,
  },
});

describe("computeMoveInsertion", () => {
  it("chooses a line-local wrapped row boundary and indicator span", () => {
    const leading = computeMoveInsertion(flexInput({ x: 10, y: 10 }));
    const firstTrailing = computeMoveInsertion(flexInput({ x: 140, y: 10 }));
    const secondLeading = computeMoveInsertion(flexInput({ x: 10, y: 90 }));
    const secondTrailing = computeMoveInsertion(flexInput({ x: 140, y: 90 }));

    expect(leading).toMatchObject({ ok: true, index: 0 });
    expect(firstTrailing).toMatchObject({ ok: true, index: 2 });
    expect(secondLeading).toMatchObject({ ok: true, index: 2 });
    expect(secondTrailing).toMatchObject({ ok: true, index: 4 });
    expect(secondTrailing).toMatchObject({
      ok: true,
      indicator: { axis: "x", position: 140, spanStart: 80, spanSize: 40 },
      visualBoundary: { beforeDomIndex: 3, afterDomIndex: null },
    });
  });

  it("uses signed main and cross axes for reverse and wrap-reverse flex", () => {
    const result = computeMoveInsertion({
      ...flexInput({ x: 15, y: 90 }),
      items: [item(0, 160, 80), item(1, 60, 80), item(2, 160, 0), item(3, 60, 0)],
      flow: {
        kind: "flex",
        axis: { writingMode: "horizontal-tb", direction: "ltr", flexDirection: "row-reverse" },
        wrap: "wrap-reverse",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      index: 2,
      indicator: { axis: "x", spanStart: 80, spanSize: 40 },
    });
  });

  it("retains invisible nodes in block DOM indices and appends all-nonvisual targets", () => {
    const result = computeMoveInsertion({
      parent,
      parentRect: { x: 0, y: 0, width: 100, height: 200 },
      childCount: 4,
      items: [
        item(0, 0, 0, 0, 0, { inFlow: false }),
        item(1, 0, 20),
        item(2, 0, 80, 0, 0, { inFlow: false }),
        item(3, 0, 120),
      ],
      movingOrder: 0,
      sourceIndex: null,
      pointer: { x: 10, y: 100 },
      flow: { kind: "block", writingMode: "horizontal-tb" },
    });
    const nonvisual = computeMoveInsertion({
      parent,
      parentRect: { x: 0, y: 0, width: 100, height: 200 },
      childCount: 2,
      items: [item(0, 0, 0, 0, 0, { inFlow: false }), item(1, 0, 0, 0, 0, { inFlow: false })],
      movingOrder: 0,
      sourceIndex: null,
      pointer: { x: 10, y: 400 },
      flow: { kind: "block", writingMode: "vertical-rl" },
    });

    expect(result).toMatchObject({
      ok: true,
      index: 3,
      indicator: { axis: "y", spanStart: 0, spanSize: 100 },
      visualBoundary: { beforeDomIndex: 1, afterDomIndex: 3 },
    });
    expect(nonvisual).toMatchObject({
      ok: true,
      index: 2,
      indicator: { axis: "x", position: 10, spanStart: 0, spanSize: 200 },
    });
  });

  it("maps an order-compatible boundary to a DOM insertion interval", () => {
    const result = computeMoveInsertion({
      parent,
      parentRect: { x: 0, y: 0, width: 200, height: 80 },
      childCount: 2,
      items: [item(0, 100, 0, 40, 40, { order: 1 }), item(1, 0, 0, 40, 40, { order: 0 })],
      movingOrder: 0,
      sourceIndex: null,
      pointer: { x: 70, y: 20 },
      flow: {
        kind: "flex",
        axis: { writingMode: "horizontal-tb", direction: "ltr", flexDirection: "row" },
        wrap: "nowrap",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      index: 2,
      visualBoundary: { beforeDomIndex: 1, afterDomIndex: 0 },
    });
  });

  it("rejects cross-order moves and ambiguous or malformed geometry", () => {
    const unrepresentable = computeMoveInsertion({
      ...flexInput({ x: 500, y: 10 }),
      items: [
        item(0, 0, 0, 40, 40, { order: 0 }),
        item(1, 300, 0, 40, 40, { order: 1 }),
        item(2, 100, 0, 40, 40, { order: 0 }),
        item(3, 200, 0, 40, 40, { order: 0 }),
      ],
      movingOrder: 0,
    });
    const ambiguous = computeMoveInsertion({
      ...flexInput({ x: 10, y: 10 }),
      items: [item(0, 0, 0), item(1, 20, 0), item(2, 0, 80), item(3, 100, 80)],
    });
    const invalid = computeMoveInsertion({
      ...flexInput({ x: Number.NaN, y: 10 }),
    });

    expect(unrepresentable).toMatchObject({
      ok: false,
      diagnostic: { code: "css-order-unrepresentable" },
    });
    expect(ambiguous).toMatchObject({ ok: false, diagnostic: { code: "ambiguous-flex-lines" } });
    expect(invalid).toMatchObject({ ok: false, diagnostic: { code: "invalid-geometry" } });
  });
});

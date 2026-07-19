import { describe, expect, it } from "vitest";

import {
  mapVisualBoundaryToDomIndex,
  resolveFlexAxis,
  resolvePhysicalFlexHandle,
  selectVisualBoundaryNeighbor,
  visualDomOrder,
} from "../index.js";

const AXIS_CASES = [
  ["horizontal-tb", "ltr", "row", "x", 1, "left", "right"],
  ["horizontal-tb", "ltr", "row-reverse", "x", -1, "right", "left"],
  ["horizontal-tb", "ltr", "column", "y", 1, "top", "bottom"],
  ["horizontal-tb", "ltr", "column-reverse", "y", -1, "bottom", "top"],
  ["horizontal-tb", "rtl", "row", "x", -1, "right", "left"],
  ["horizontal-tb", "rtl", "row-reverse", "x", 1, "left", "right"],
  ["horizontal-tb", "rtl", "column", "y", 1, "top", "bottom"],
  ["horizontal-tb", "rtl", "column-reverse", "y", -1, "bottom", "top"],
  ["vertical-rl", "ltr", "row", "y", 1, "top", "bottom"],
  ["vertical-rl", "ltr", "row-reverse", "y", -1, "bottom", "top"],
  ["vertical-rl", "ltr", "column", "x", -1, "right", "left"],
  ["vertical-rl", "ltr", "column-reverse", "x", 1, "left", "right"],
  ["vertical-rl", "rtl", "row", "y", -1, "bottom", "top"],
  ["vertical-rl", "rtl", "row-reverse", "y", 1, "top", "bottom"],
  ["vertical-rl", "rtl", "column", "x", -1, "right", "left"],
  ["vertical-rl", "rtl", "column-reverse", "x", 1, "left", "right"],
  ["vertical-lr", "ltr", "row", "y", 1, "top", "bottom"],
  ["vertical-lr", "ltr", "row-reverse", "y", -1, "bottom", "top"],
  ["vertical-lr", "ltr", "column", "x", 1, "left", "right"],
  ["vertical-lr", "ltr", "column-reverse", "x", -1, "right", "left"],
  ["vertical-lr", "rtl", "row", "y", -1, "bottom", "top"],
  ["vertical-lr", "rtl", "row-reverse", "y", 1, "top", "bottom"],
  ["vertical-lr", "rtl", "column", "x", 1, "left", "right"],
  ["vertical-lr", "rtl", "column-reverse", "x", -1, "right", "left"],
] as const;

describe("Given the fixed logical-axis oracle", () => {
  it.each(
    AXIS_CASES,
  )("when resolving %s/%s/%s, then the literal logical-axis matrix yields %s/%s", (writingMode, direction, flexDirection, axis, sign, mainStartHandle, mainEndHandle) => {
    expect(resolveFlexAxis({ writingMode, direction, flexDirection })).toEqual({
      axis,
      sign,
      mainStartHandle,
      mainEndHandle,
    });
  });
});

describe("Given all four physical side handles", () => {
  const HANDLE_CASES = [
    ["x", 1, "left", { kind: "main-axis", boundary: "main-start" }],
    ["x", 1, "right", { kind: "main-axis", boundary: "main-end" }],
    ["x", 1, "top", { kind: "cross-axis" }],
    ["x", 1, "bottom", { kind: "cross-axis" }],
    ["x", -1, "left", { kind: "main-axis", boundary: "main-end" }],
    ["x", -1, "right", { kind: "main-axis", boundary: "main-start" }],
    ["y", 1, "top", { kind: "main-axis", boundary: "main-start" }],
    ["y", 1, "bottom", { kind: "main-axis", boundary: "main-end" }],
    ["y", 1, "left", { kind: "cross-axis" }],
    ["y", 1, "right", { kind: "cross-axis" }],
    ["y", -1, "top", { kind: "main-axis", boundary: "main-end" }],
    ["y", -1, "bottom", { kind: "main-axis", boundary: "main-start" }],
  ] as const;

  it.each(
    HANDLE_CASES,
  )("when the main progression is %s/%s and the handle is %s, then routing is literal", (axis, sign, handle, expected) => {
    expect(resolvePhysicalFlexHandle({ axis, sign, handle })).toEqual(expected);
  });
});

describe("Given signed visual and DOM order", () => {
  it("when progression is positive, then visual order and insertion boundaries match DOM order", () => {
    expect(visualDomOrder({ childCount: 4, sign: 1 })).toEqual({
      ok: true,
      domIndices: [0, 1, 2, 3],
    });
    expect(mapVisualBoundaryToDomIndex({ childCount: 4, visualBoundaryIndex: 3, sign: 1 })).toEqual(
      { ok: true, domIndex: 3 },
    );
  });

  it("when progression is negative, then visual order and every edge boundary reverse", () => {
    expect(visualDomOrder({ childCount: 4, sign: -1 })).toEqual({
      ok: true,
      domIndices: [3, 2, 1, 0],
    });
    expect(
      mapVisualBoundaryToDomIndex({ childCount: 4, visualBoundaryIndex: 0, sign: -1 }),
    ).toEqual({ ok: true, domIndex: 4 });
    expect(
      mapVisualBoundaryToDomIndex({ childCount: 4, visualBoundaryIndex: 1, sign: -1 }),
    ).toEqual({ ok: true, domIndex: 3 });
    expect(
      mapVisualBoundaryToDomIndex({ childCount: 4, visualBoundaryIndex: 4, sign: -1 }),
    ).toEqual({ ok: true, domIndex: 0 });
  });

  it("when dragging a negative-progression main-start boundary, then the visual neighbor is the next DOM child", () => {
    expect(
      selectVisualBoundaryNeighbor({
        childCount: 4,
        primaryDomIndex: 1,
        boundary: "main-start",
        sign: -1,
        ambiguous: false,
      }),
    ).toEqual({
      ok: true,
      primaryVisualIndex: 2,
      neighborVisualIndex: 1,
      neighborDomIndex: 2,
    });
  });

  it("when dragging a negative-progression main-end boundary, then the visual neighbor is the previous DOM child", () => {
    expect(
      selectVisualBoundaryNeighbor({
        childCount: 4,
        primaryDomIndex: 1,
        boundary: "main-end",
        sign: -1,
        ambiguous: false,
      }),
    ).toEqual({
      ok: true,
      primaryVisualIndex: 2,
      neighborVisualIndex: 3,
      neighborDomIndex: 0,
    });
  });

  it("when a visual boundary has no neighbor or is ambiguous, then selection rejects explicitly", () => {
    expect(
      selectVisualBoundaryNeighbor({
        childCount: 2,
        primaryDomIndex: 0,
        boundary: "main-start",
        sign: 1,
        ambiguous: false,
      }),
    ).toMatchObject({ ok: false, diagnostic: { code: "missing_visual_neighbor" } });
    expect(
      selectVisualBoundaryNeighbor({
        childCount: 2,
        primaryDomIndex: 0,
        boundary: "main-end",
        sign: 1,
        ambiguous: true,
      }),
    ).toMatchObject({ ok: false, diagnostic: { code: "ambiguous_visual_neighbor" } });
  });

  it("when counts or indices are malformed, then mapping rejects instead of inventing an index", () => {
    expect(visualDomOrder({ childCount: -1, sign: 1 })).toMatchObject({
      ok: false,
      diagnostic: { code: "malformed_model" },
    });
    expect(
      mapVisualBoundaryToDomIndex({ childCount: 3, visualBoundaryIndex: 3.5, sign: 1 }),
    ).toMatchObject({ ok: false, diagnostic: { code: "malformed_model" } });
  });
});

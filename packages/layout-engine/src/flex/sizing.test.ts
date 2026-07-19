import { describe, expect, it } from "vitest";

import {
  computeLegalDeltaInterval,
  convertConstraintToBorderBox,
  convertUsedSizeToFlexBasis,
  type FlexSizingMemberInput,
  planPairedFlexResize,
  validatePairedFlexResize,
} from "../index.js";

const CONTENT_BOX = {
  boxSizing: "content-box",
  paddingMainStart: 10.25,
  paddingMainEnd: 9.75,
  borderMainStart: 1.5,
  borderMainEnd: 0.5,
} as const;

const BORDER_BOX = {
  boxSizing: "border-box",
  paddingMainStart: 10.25,
  paddingMainEnd: 9.75,
  borderMainStart: 1.5,
  borderMainEnd: 0.5,
} as const;

const member = (overrides: Partial<FlexSizingMemberInput> = {}): FlexSizingMemberInput => ({
  beforeBorderBoxMainSize: 100,
  box: BORDER_BOX,
  min: { kind: "numeric", value: 40 },
  max: { kind: "numeric", value: 180 },
  ...overrides,
});

describe("Given border-box used sizes and CSS box models", () => {
  it("when content-box basis is derived, then padding and borders are subtracted while margins remain outside", () => {
    expect(
      convertUsedSizeToFlexBasis({ desiredBorderBoxMainSize: 200.5, box: CONTENT_BOX }),
    ).toEqual({ ok: true, basisPixels: 178.5 });
  });

  it("when border-box basis is derived, then the desired used size is preserved literally", () => {
    expect(
      convertUsedSizeToFlexBasis({ desiredBorderBoxMainSize: 200.5, box: BORDER_BOX }),
    ).toEqual({ ok: true, basisPixels: 200.5 });
  });

  it("when numeric constraints are converted, then content-box edges are added to border-box units", () => {
    expect(
      convertConstraintToBorderBox({
        constraint: { kind: "numeric", value: 80.5 },
        bound: "min",
        box: CONTENT_BOX,
      }),
    ).toEqual({ kind: "resolved", borderBoxPixels: 102.5 });
  });

  it("when max is none or a bound is intrinsic, then it is unbounded or validation-required", () => {
    expect(
      convertConstraintToBorderBox({
        constraint: { kind: "none" },
        bound: "max",
        box: BORDER_BOX,
      }),
    ).toEqual({ kind: "unbounded" });
    expect(
      convertConstraintToBorderBox({
        constraint: { kind: "keyword", value: "min-content" },
        bound: "min",
        box: BORDER_BOX,
      }),
    ).toEqual({ kind: "validation-required", keyword: "min-content", bound: "min" });
  });
});

describe("Given both members' min/max constraints", () => {
  it("when intervals overlap, then the paired legal-delta intersection is literal", () => {
    expect(
      computeLegalDeltaInterval({
        primary: member({
          beforeBorderBoxMainSize: 160,
          min: { kind: "numeric", value: 100 },
          max: { kind: "numeric", value: 220 },
        }),
        neighbor: member({
          beforeBorderBoxMainSize: 140,
          min: { kind: "numeric", value: 80 },
          max: { kind: "numeric", value: 200 },
        }),
      }),
    ).toEqual({ ok: true, interval: { minimum: -60, maximum: 60 }, requirements: [] });
  });

  it("when the neighbor is tighter, then the intersection narrows without clamping the request", () => {
    expect(
      computeLegalDeltaInterval({
        primary: member({
          beforeBorderBoxMainSize: 100,
          min: { kind: "numeric", value: 80 },
          max: { kind: "numeric", value: 160 },
        }),
        neighbor: member({
          beforeBorderBoxMainSize: 120,
          min: { kind: "numeric", value: 100 },
          max: { kind: "numeric", value: 140 },
        }),
      }),
    ).toEqual({ ok: true, interval: { minimum: -20, maximum: 20 }, requirements: [] });
  });

  it("when min exceeds max, then impossible constraints reject explicitly", () => {
    expect(
      computeLegalDeltaInterval({
        primary: member({
          min: { kind: "numeric", value: 200 },
          max: { kind: "numeric", value: 100 },
        }),
        neighbor: member(),
      }),
    ).toMatchObject({ ok: false, diagnostic: { code: "invalid_constraints" } });
  });
});

describe("Given an atomic paired resize", () => {
  it("when delta is +40, then literal +40/-40 conservation produces two 0 0 basis states", () => {
    expect(
      planPairedFlexResize({
        requestedDelta: 40,
        primary: member({
          beforeBorderBoxMainSize: 160,
          box: CONTENT_BOX,
          min: { kind: "numeric", value: 50 },
          max: { kind: "numeric", value: 300 },
        }),
        neighbor: member({
          beforeBorderBoxMainSize: 140,
          min: { kind: "numeric", value: 50 },
          max: { kind: "none" },
        }),
      }),
    ).toEqual({
      kind: "accepted",
      candidate: {
        requestedDelta: 40,
        primary: {
          beforeBorderBoxMainSize: 160,
          afterBorderBoxMainSize: 200,
          afterFlex: { flexGrow: 0, flexShrink: 0, flexBasisPixels: 178 },
        },
        neighbor: {
          beforeBorderBoxMainSize: 140,
          afterBorderBoxMainSize: 100,
          afterFlex: { flexGrow: 0, flexShrink: 0, flexBasisPixels: 100 },
        },
        beforePairTotal: 300,
        afterPairTotal: 300,
      },
      interval: { minimum: -88, maximum: 90 },
    });
  });

  it("when the requested delta exceeds the legal interval, then it rejects rather than silently clamping", () => {
    expect(
      planPairedFlexResize({
        requestedDelta: 40,
        primary: member({ beforeBorderBoxMainSize: 100 }),
        neighbor: member({
          beforeBorderBoxMainSize: 120,
          min: { kind: "numeric", value: 100 },
          max: { kind: "numeric", value: 140 },
        }),
      }),
    ).toMatchObject({
      kind: "rejected",
      diagnostic: {
        code: "min_max_clamp",
        requestedDelta: 40,
        interval: { minimum: -20, maximum: 20 },
      },
    });
  });

  it("when intrinsic constraints are present, then success waits for exact post-layout validation", () => {
    const planned = planPairedFlexResize({
      requestedDelta: 10,
      primary: member({ min: { kind: "keyword", value: "min-content" } }),
      neighbor: member({ max: { kind: "keyword", value: "max-content" } }),
    });

    expect(planned).toMatchObject({
      kind: "validation-required",
      requirements: [
        { member: "primary", bound: "min", keyword: "min-content" },
        { member: "neighbor", bound: "max", keyword: "max-content" },
      ],
    });
    if (planned.kind !== "validation-required") return;

    expect(
      validatePairedFlexResize({
        candidate: planned.candidate,
        observed: { primaryBorderBoxMainSize: 110, neighborBorderBoxMainSize: 90 },
        tolerance: 0,
      }),
    ).toMatchObject({ kind: "accepted" });
    expect(
      validatePairedFlexResize({
        candidate: planned.candidate,
        observed: { primaryBorderBoxMainSize: 109.5, neighborBorderBoxMainSize: 90 },
        tolerance: 0,
      }),
    ).toMatchObject({
      kind: "rejected",
      diagnostic: { code: "intrinsic_validation_failed" },
    });
  });
});

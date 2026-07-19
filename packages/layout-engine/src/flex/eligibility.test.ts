import { describe, expect, it } from "vitest";

import {
  evaluateFlexPairEligibility,
  type FlexContainerModel,
  type FlexItemModel,
  type FlexPairEligibilityInput,
  parseFlexPairEligibilityInput,
} from "../index.js";

const effects = (transformAffected = false, zoomAffected = false) => ({
  transformAffected,
  zoomAffected,
});

const item = (overrides: Partial<FlexItemModel> = {}): FlexItemModel => ({
  order: 0,
  inFlow: true,
  display: "box",
  rect: { x: 0, y: 0, width: 100.5, height: 40.25 },
  marginMainStart: 0,
  marginMainEnd: 0,
  effects: effects(),
  ...overrides,
});

const BASE_CONTAINER: FlexContainerModel = {
  flexWrap: "nowrap",
  mainSize: 201,
  rect: { x: 0, y: 0, width: 201, height: 40.25 },
  effects: effects(),
  ancestorEffects: [],
  hasNonWhitespaceDirectText: false,
};

const input = (overrides: Partial<FlexPairEligibilityInput> = {}): FlexPairEligibilityInput => ({
  context: { writingMode: "horizontal-tb", direction: "ltr", flexDirection: "row" },
  boundary: "main-end",
  primaryDomIndex: 0,
  visualNeighborAmbiguous: false,
  container: BASE_CONTAINER,
  items: [item(), item({ rect: { x: 100.5, y: 0, width: 100.5, height: 40.25 } })],
  ...overrides,
});

describe("Given a safe nowrap flex pair", () => {
  it("when eligibility is evaluated, then the exact visual neighbor and order are returned without input mutation", () => {
    const model = input();
    const before = input();

    expect(evaluateFlexPairEligibility(model)).toEqual({
      eligible: true,
      axis: { axis: "x", sign: 1, mainStartHandle: "left", mainEndHandle: "right" },
      primaryDomIndex: 0,
      neighborDomIndex: 1,
      visualDomIndices: [0, 1],
    });
    expect(model).toEqual(before);
  });
});

describe("Given unsafe or malformed flex models", () => {
  const REJECTIONS: readonly {
    readonly name: string;
    readonly model: FlexPairEligibilityInput;
    readonly expected: Readonly<Record<string, string | number | boolean>>;
  }[] = [
    {
      name: "wrapped layout",
      model: input({ container: { ...BASE_CONTAINER, flexWrap: "wrap" } }),
      expected: { code: "wrapped_layout" },
    },
    {
      name: "nonzero order",
      model: input({ items: [item(), item({ order: 2 })] }),
      expected: { code: "nonzero_order", domIndex: 1 },
    },
    {
      name: "primary transform",
      model: input({ items: [item({ effects: effects(true, false) }), item()] }),
      expected: { code: "transform_affected_geometry", subject: "primary" },
    },
    {
      name: "neighbor zoom",
      model: input({ items: [item(), item({ effects: effects(false, true) })] }),
      expected: { code: "zoom_affected_geometry", subject: "neighbor" },
    },
    {
      name: "container transform",
      model: input({ container: { ...BASE_CONTAINER, effects: effects(true, false) } }),
      expected: { code: "transform_affected_geometry", subject: "container" },
    },
    {
      name: "container zoom",
      model: input({ container: { ...BASE_CONTAINER, effects: effects(false, true) } }),
      expected: { code: "zoom_affected_geometry", subject: "container" },
    },
    {
      name: "ancestor transform",
      model: input({ container: { ...BASE_CONTAINER, ancestorEffects: [effects(true, false)] } }),
      expected: { code: "transform_affected_geometry", subject: "ancestor" },
    },
    {
      name: "ancestor zoom",
      model: input({ container: { ...BASE_CONTAINER, ancestorEffects: [effects(false, true)] } }),
      expected: { code: "zoom_affected_geometry", subject: "ancestor" },
    },
    {
      name: "main-axis auto margin",
      model: input({ items: [item(), item({ marginMainStart: "auto" })] }),
      expected: { code: "main_axis_auto_margin", domIndex: 1 },
    },
    {
      name: "out-of-flow item",
      model: input({ items: [item(), item({ inFlow: false })] }),
      expected: { code: "out_of_flow_item", domIndex: 1 },
    },
    {
      name: "display contents item",
      model: input({ items: [item(), item({ display: "contents" })] }),
      expected: { code: "display_contents_item", domIndex: 1 },
    },
    {
      name: "invalid box",
      model: input({ items: [item(), item({ rect: { x: 0, y: 0, width: -1, height: 40 } })] }),
      expected: { code: "invalid_box", domIndex: 1 },
    },
    {
      name: "invalid container box",
      model: input({
        container: { ...BASE_CONTAINER, rect: { x: 0, y: 0, width: Number.NaN, height: 40 } },
      }),
      expected: { code: "invalid_box" },
    },
    {
      name: "zero-size box",
      model: input({ items: [item(), item({ rect: { x: 0, y: 0, width: 0, height: 40 } })] }),
      expected: { code: "zero_size_box", domIndex: 1 },
    },
    {
      name: "indefinite container main size",
      model: input({ container: { ...BASE_CONTAINER, mainSize: null } }),
      expected: { code: "indefinite_container_main_size" },
    },
    {
      name: "missing visual neighbor",
      model: input({ items: [item()] }),
      expected: { code: "missing_visual_neighbor" },
    },
    {
      name: "ambiguous visual neighbor",
      model: input({ visualNeighborAmbiguous: true }),
      expected: { code: "ambiguous_visual_neighbor" },
    },
    {
      name: "anonymous flex item",
      model: input({ container: { ...BASE_CONTAINER, hasNonWhitespaceDirectText: true } }),
      expected: { code: "anonymous_flex_item" },
    },
  ];

  it.each(REJECTIONS)("when $name is present, then eligibility returns the explicit rejection", ({
    model,
    expected,
  }) => {
    expect(evaluateFlexPairEligibility(model)).toMatchObject({
      eligible: false,
      diagnostic: expected,
    });
  });

  it("when the model object is structurally malformed, then parsing returns malformed_model", () => {
    expect(parseFlexPairEligibilityInput({ container: {} })).toMatchObject({
      ok: false,
      diagnostic: { code: "malformed_model" },
    });
  });

  it("when numeric model fields are non-finite, then evaluation rejects instead of succeeding", () => {
    expect(
      evaluateFlexPairEligibility(
        input({ container: { ...BASE_CONTAINER, mainSize: Number.NaN } }),
      ),
    ).toMatchObject({
      eligible: false,
      diagnostic: { code: "indefinite_container_main_size" },
    });
  });
});

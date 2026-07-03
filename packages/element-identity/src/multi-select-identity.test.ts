import { describe, expect, it } from "vitest";

import {
  createMultiSelectGroupId,
  type ElementRef,
  isMultiSelectGroupId,
  type MultiSelectFrameKind,
  MultiSelectFrameKindSchema,
  type MultiSelectGroupId,
  MultiSelectGroupIdSchema,
  type MultiSelectMember,
  MultiSelectMemberSchema,
  MultiSelectShadowKindSchema,
} from "./index.js";

const member = (
  runtimeId: string,
  additions: Partial<Omit<MultiSelectMember, "runtimeId">> = {},
): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
  ...additions,
});

describe("MultiSelectGroupId branding", () => {
  it("creates a branded id from a non-empty string", () => {
    const id = createMultiSelectGroupId("grp-0001");
    expect(id).toBe("grp-0001");
    // Brand is structural: assignable to the branded type but a plain string
    // is NOT assignable back without the factory.
    const _: MultiSelectGroupId = id;
    expect(_).toBe(id);
  });

  it("rejects an empty group id", () => {
    expect(() => createMultiSelectGroupId("")).toThrow(/non-empty/i);
  });

  it("the wire schema infers plain string (brand not on the wire)", () => {
    const parsed = MultiSelectGroupIdSchema.safeParse("grp-0042");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(typeof parsed.data).toBe("string");
      expect(parsed.data).toBe("grp-0042");
    }
  });

  it("the wire schema rejects an empty group id", () => {
    expect(MultiSelectGroupIdSchema.safeParse("").success).toBe(false);
  });

  it("isMultiSelectGroupId narrows a branded id but not a bare string at the type level", () => {
    const id = createMultiSelectGroupId("grp-0009");
    expect(isMultiSelectGroupId(id)).toBe(true);
    // A plain string value still returns true at runtime (brand is erased),
    // but callers obtain the brand only via the factory.
    expect(isMultiSelectGroupId("anything")).toBe(true);
  });
});

describe("frame / shadow kind taxonomy", () => {
  it("frame kind enum is exactly top | same-origin-iframe", () => {
    expect(MultiSelectFrameKindSchema.safeParse("top").success).toBe(true);
    expect(MultiSelectFrameKindSchema.safeParse("same-origin-iframe").success).toBe(true);
    // Cross-origin iframes are NOT representable: they are never selectable.
    expect(MultiSelectFrameKindSchema.safeParse("cross-origin-iframe").success).toBe(false);
  });

  it("shadow kind enum is exactly light-dom | open-shadow-root", () => {
    expect(MultiSelectShadowKindSchema.safeParse("light-dom").success).toBe(true);
    expect(MultiSelectShadowKindSchema.safeParse("open-shadow-root").success).toBe(true);
    // Closed shadow roots are NOT representable: never selectable.
    expect(MultiSelectShadowKindSchema.safeParse("closed-shadow-root").success).toBe(false);
  });
});

describe("MultiSelectMember", () => {
  it("extends ElementRef with frame + shadow location metadata", () => {
    const ref: ElementRef = {
      runtimeId: "r1",
      sourceId: "s1",
      selector: "[data-vc-source='s1']",
      tagName: "button",
    };
    const m: MultiSelectMember = {
      ...ref,
      frameId: "main",
      frameKind: "top",
      shadowKind: "light-dom",
    };
    const result = MultiSelectMemberSchema.safeParse(m);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeId).toBe("r1");
      expect(result.data.frameKind).toBe("top");
      expect(result.data.shadowKind).toBe("light-dom");
    }
  });

  it("rejects a member missing frame metadata", () => {
    const result = MultiSelectMemberSchema.safeParse({ runtimeId: "r1", tagName: "div" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid shadow kind", () => {
    const result = MultiSelectMemberSchema.safeParse({
      runtimeId: "r1",
      tagName: "div",
      frameId: "main",
      frameKind: "top",
      shadowKind: "closed-shadow-root",
    });
    expect(result.success).toBe(false);
  });

  it("a same-origin-iframe member round-trips through the schema", () => {
    const m = member("r-iframe", {
      frameId: "frame-2",
      frameKind: "same-origin-iframe" as MultiSelectFrameKind,
    });
    const result = MultiSelectMemberSchema.safeParse(m);
    expect(result.success).toBe(true);
  });
});

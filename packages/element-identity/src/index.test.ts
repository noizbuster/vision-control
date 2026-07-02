import { describe, expect, it } from "vitest";
import {
  idOnlyDescriptor,
  listItemDescriptor,
  sourceMarkedDescriptor,
  stableClassDescriptor,
  volatileOnlyDescriptor,
} from "./__fixtures__/descriptors.js";
import {
  ABSOLUTE_PATH_PATTERN,
  computeFingerprint,
  createRuntimeId,
  createSourceId,
  type ElementRef,
  ElementRefSchema,
  generateStableSelector,
  IdentityConfidenceSchema,
  InvalidSourceIdError,
  isAbsolutePath,
  isDistinctRuntime,
  isSameSource,
  SelectionIdentitySchema,
  toSelectionIdentity,
} from "./index.js";

describe("element-ref schema", () => {
  it("parses a minimal valid ElementRef", () => {
    const ref = { runtimeId: "r1", tagName: "div" };
    const result = ElementRefSchema.safeParse(ref);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeId).toBe("r1");
      expect(result.data.tagName).toBe("div");
    }
  });

  it("parses a full ElementRef", () => {
    const ref: ElementRef = {
      runtimeId: "r_btn_1",
      sourceId: "s_btn",
      selector: '[data-vc-source="s_btn"]',
      tagName: "button",
      role: "button",
      name: "Submit",
    };
    expect(ElementRefSchema.safeParse(ref).success).toBe(true);
  });

  it("rejects an empty runtimeId", () => {
    expect(ElementRefSchema.safeParse({ runtimeId: "", tagName: "div" }).success).toBe(false);
  });

  it("round-trips through JSON", () => {
    const ref: ElementRef = { runtimeId: "r1", sourceId: "s1", tagName: "p", name: "hello" };
    const round = JSON.parse(JSON.stringify(ref)) as ElementRef;
    expect(ElementRefSchema.safeParse(round).success).toBe(true);
  });
});

describe("selection-identity schema", () => {
  it("extends ElementRef with selection fields", () => {
    const identity = {
      runtimeId: "r1",
      sourceId: "s1",
      tagName: "button",
      frameId: "main",
      fingerprint: "deadbeef",
      confidence: "high",
    };
    const result = SelectionIdentitySchema.safeParse(identity);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frameId).toBe("main");
      expect(result.data.confidence).toBe("high");
    }
  });

  it("rejects an invalid confidence value", () => {
    expect(
      SelectionIdentitySchema.safeParse({
        runtimeId: "r1",
        tagName: "button",
        frameId: "main",
        fingerprint: "f",
        confidence: "certain",
      }).success,
    ).toBe(false);
  });

  it("IdentityConfidenceSchema enumerates the three levels", () => {
    expect(IdentityConfidenceSchema.options).toEqual(["high", "medium", "low"]);
  });

  it("toSelectionIdentity builds from a ref and omits undefined optionals", () => {
    const identity = toSelectionIdentity(
      { runtimeId: "r1", tagName: "button" },
      { frameId: "main", fingerprint: "f", confidence: "medium" },
    );
    expect(identity.frameId).toBe("main");
    expect("tabId" in identity).toBe(false);
    expect("sourceSnippet" in identity).toBe(false);
  });

  it("toSelectionIdentity forwards optionals when provided", () => {
    const identity = toSelectionIdentity(
      { runtimeId: "r1", tagName: "button" },
      { frameId: "main", fingerprint: "f", confidence: "low", tabId: "tab-1", sourceSnippet: "x" },
    );
    expect(identity.tabId).toBe("tab-1");
    expect(identity.sourceSnippet).toBe("x");
  });
});

describe("generateStableSelector", () => {
  it("prefers the data-vc-source attribute", () => {
    const selector = generateStableSelector({ descriptor: sourceMarkedDescriptor });
    expect(selector).toBe('[data-vc-source="s_button_submit"]');
  });

  it("falls back to the element id", () => {
    const selector = generateStableSelector({ descriptor: idOnlyDescriptor });
    expect(selector).toBe("#email-field");
  });

  it("uses tag + stable classes when no id or marker", () => {
    const selector = generateStableSelector({ descriptor: stableClassDescriptor });
    expect(selector).toBe("span.badge.badge-pill");
  });

  it("falls back to the ancestry nth-child path for volatile-only classes", () => {
    const selector = generateStableSelector({ descriptor: volatileOnlyDescriptor });
    expect(selector).toBe("section:nth-child(2) > ul:nth-child(1) > li:nth-child(3)");
  });

  it("never emits an absolute filesystem path", () => {
    // Negative test 2: a generated selector must not embed an absolute path.
    for (const descriptor of [
      sourceMarkedDescriptor,
      idOnlyDescriptor,
      stableClassDescriptor,
      volatileOnlyDescriptor,
      listItemDescriptor("a"),
    ]) {
      const selector = generateStableSelector({ descriptor });
      expect(ABSOLUTE_PATH_PATTERN.test(selector), `selector="${selector}"`).toBe(false);
    }
  });

  it("escapes special characters in ids and attribute values", () => {
    const selector = generateStableSelector({
      descriptor: {
        tagName: "div",
        id: "foo.bar",
        attributes: { "data-vc-source": 'a"b' },
      },
    });
    // Marker takes priority; the embedded quote must be escaped.
    expect(selector).toBe('[data-vc-source="a\\"b"]');
    expect(generateStableSelector({ descriptor: { tagName: "div", id: "foo.bar" } })).toBe(
      "#foo\\.bar",
    );
  });
});

describe("computeFingerprint", () => {
  it("is deterministic for the same descriptor", () => {
    expect(computeFingerprint(sourceMarkedDescriptor)).toBe(
      computeFingerprint(sourceMarkedDescriptor),
    );
  });

  it("changes when the tag ancestry changes", () => {
    const a: typeof sourceMarkedDescriptor = {
      ...sourceMarkedDescriptor,
      ancestry: [{ tagName: "div" }],
    };
    const b: typeof sourceMarkedDescriptor = {
      ...sourceMarkedDescriptor,
      ancestry: [{ tagName: "section" }],
    };
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("is unaffected by volatile class changes", () => {
    const base = computeFingerprint({ tagName: "div", attributes: { id: "x" } });
    const withClasses = computeFingerprint({
      tagName: "div",
      className: "card__hash123 css-abc",
      attributes: { id: "x" },
    });
    expect(base).toBe(withClasses);
  });

  it("produces an 8-char hex string", () => {
    expect(computeFingerprint(sourceMarkedDescriptor)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("runtime/source separation", () => {
  it("createSourceId rejects an absolute path", () => {
    expect(() => createSourceId("/home/user/project/src/App.tsx")).toThrow(InvalidSourceIdError);
    expect(() => createSourceId("C:\\Users\\me\\App.tsx")).toThrow(InvalidSourceIdError);
    expect(() => createSourceId("")).toThrow(InvalidSourceIdError);
  });

  it("createSourceId accepts a workspace-relative opaque id", () => {
    const id = createSourceId("s_card_product");
    expect(id).toBe("s_card_product");
  });

  it("createRuntimeId rejects an empty string", () => {
    expect(() => createRuntimeId("")).toThrow();
    expect(createRuntimeId("r_card_1")).toBe("r_card_1");
  });

  it("isAbsolutePath matches POSIX and Windows roots", () => {
    expect(isAbsolutePath("/etc/hosts")).toBe(true);
    expect(isAbsolutePath("C:/x")).toBe(true);
    expect(isAbsolutePath("D:\\x")).toBe(true);
    expect(isAbsolutePath("src/App.tsx")).toBe(false);
    expect(isAbsolutePath("s_card")).toBe(false);
  });

  it("isSameSource and isDistinctRuntime enforce the split", () => {
    const srcA = createSourceId("s_card");
    const srcB = createSourceId("s_card");
    const srcC = createSourceId("s_other");
    expect(isSameSource(srcA, srcB)).toBe(true);
    expect(isSameSource(srcA, srcC)).toBe(false);
    expect(isSameSource(srcA, undefined)).toBe(false);

    const rt1 = createRuntimeId("r_card_1");
    const rt2 = createRuntimeId("r_card_2");
    expect(isDistinctRuntime(rt1, rt2)).toBe(true);
    expect(isDistinctRuntime(rt1, rt1)).toBe(false);
  });

  it("treats repeated instances (same sourceId, distinct runtimeId) as distinct DOM nodes", () => {
    // Repeated instance test: two list items rendered from the same JSX line.
    const itemA: ElementRef = {
      runtimeId: "r_card_1",
      sourceId: "s_card",
      tagName: "li",
    };
    const itemB: ElementRef = {
      runtimeId: "r_card_2",
      sourceId: "s_card",
      tagName: "li",
    };
    // Shared source lineage...
    expect(isSameSource(itemA.sourceId, itemB.sourceId)).toBe(true);
    // ...but distinct DOM instances.
    expect(isDistinctRuntime(itemA.runtimeId, itemB.runtimeId)).toBe(true);
    // A keying structure by runtime id keeps both; by source id collapses to one.
    const byRuntime = new Map<string, ElementRef>([
      [itemA.runtimeId, itemA],
      [itemB.runtimeId, itemB],
    ]);
    const bySource = new Set<string>([itemA.sourceId ?? "", itemB.sourceId ?? ""]);
    expect(byRuntime.size).toBe(2);
    expect(bySource.size).toBe(1);
  });

  it("list-item descriptors produce the same source-marker selector across instances", () => {
    const selA = generateStableSelector({ descriptor: listItemDescriptor("a") });
    const selB = generateStableSelector({ descriptor: listItemDescriptor("b") });
    expect(selA).toBe(selB);
    expect(selA).toBe('[data-vc-source="s_todo_item"]');
  });
});
